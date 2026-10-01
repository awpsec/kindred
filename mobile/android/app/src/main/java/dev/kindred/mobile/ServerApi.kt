package dev.kindred.mobile

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiFailure(val status: Int, message: String) : Exception(message)
object ServerApi {
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS).callTimeout(30, TimeUnit.SECONDS).build()
    fun request(server: String, path: String, token: String = "", method: String = "GET", body: JSONObject? = null): JSONObject {
        require(server == ServerAddress.normalize(server))
        require(path.startsWith("/api/") || path.startsWith("/identity/"))
        val request = Request.Builder().url(server + path).header("Accept", "application/json")
        if (token.isNotEmpty()) request.header("Authorization", "Bearer $token")
        request.method(method, if (method == "GET") null else (body ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()))
        client.newCall(request.build()).execute().use { response ->
            val source = response.body?.source() ?: throw ApiFailure(response.code, "The server returned an empty response.")
            source.request(2 * 1024 * 1024L + 1)
            if (source.buffer.size > 2 * 1024 * 1024) throw ApiFailure(response.code, "The server response is too large.")
            val raw = source.readUtf8()
            val value = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
            if (!response.isSuccessful) throw ApiFailure(response.code,
                if (response.isRedirect) "The server redirected this request. Enter its final HTTPS address."
                else value.optString("error", "The server could not complete this request (${response.code})."))
            return value
        }
    }
}
