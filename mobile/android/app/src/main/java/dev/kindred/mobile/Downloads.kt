package dev.kindred.mobile

import android.content.Context
import android.net.Uri
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/** One bounded blob export, staged privately until the user chooses a document destination.
 * Server-provided names are suggestions, never filesystem paths. */
class Downloads(private val context: Context) {
    private var id: String?=null
    private var file: File?=null
    private var stream: FileOutputStream?=null
    private var expected=0L
    private var received=0L
    private var name="download"
    private var reply: ((String)->Unit)?=null
    @Synchronized fun accept(data: JSONObject, respond: (String)->Unit, choose: (String)->Unit) {
        val request=data.getString("id")
        require(UUID.fromString(request).toString()==request)
        when(data.getString("type")) {
            "download-start" -> {
                check(id==null) { "Finish the current download first." }
                expected=data.getLong("size"); require(expected in 0..32L*1024*1024) { "Mobile downloads are limited to 32 MB." }
                name=data.optString("name","download").replace(Regex("[\\\\/:\\p{Cntrl}]"),"_").trim('.',' ').take(120).ifEmpty { "download" }
                val folder=File(context.cacheDir,"exports").apply { mkdirs() }
                folder.listFiles()?.filter { it.lastModified()<System.currentTimeMillis()-86400000 }?.forEach { it.delete() }
                file=File.createTempFile("export-",".tmp",folder); stream=FileOutputStream(file)
                id=request; received=0; reply=respond
                respond(JSONObject().put("id",id).put("stage","ready").toString())
            }
            "download-chunk" -> {
                check(id==request && stream!=null)
                val chunk=data.getString("data"); require(chunk.length<=24000)
                val bytes=Base64.decode(chunk,Base64.NO_WRAP)
                require(received+bytes.size<=expected)
                stream!!.write(bytes); received+=bytes.size
            }
            "download-end" -> {
                check(id==request && stream!=null && received==expected)
                stream!!.close(); stream=null; choose(name)
            }
            "download-cancel" -> if(id==request) cancel()
        }
    }
    fun save(uri: Uri?) {
        // Detach the completed transfer under the lock. A later account switch
        // or export cannot delete its file or receive this export's callback.
        val transfer=synchronized(this) {
            val staged=file ?: return
            if(stream!=null) return
            val snapshot=Triple(staged,id,reply)
            file=null; id=null; reply=null
            snapshot
        }
        val (staged,request,respond)=transfer
        try {
            if(uri!=null) context.contentResolver.openOutputStream(uri,"wt").use { output ->
                checkNotNull(output) { "Could not open that document." }
                staged.inputStream().use { it.copyTo(output) }
            }
            respond?.invoke(JSONObject().put("id",request).put("stage",if(uri==null) "cancelled" else "saved").toString())
        } catch(_: Exception) {
            respond?.invoke(JSONObject().put("id",request).put("error","The file could not be saved. Try another location.").toString())
        } finally { staged.delete() }
    }
    @Synchronized fun cancel() { runCatching { stream?.close() }; stream=null; file?.delete(); file=null; id=null; reply=null }
}
