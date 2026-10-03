package dev.kindred.mobile

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Full-screen QR scanner for pairing. Returns the scanned text only when it is shaped like a Kindred link;
 * MainActivity parses it and asks for confirmation. Not exported. */
class ScanActivity : AppCompatActivity() {
    private lateinit var preview: PreviewView
    private lateinit var hint: TextView
    private lateinit var blocked: LinearLayout
    private var analysis: ExecutorService? = null
    private val delivered = AtomicBoolean(false)
    @Volatile private var hintUntil = 0L
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        if (allowed) startCamera() else showBlocked(true)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The scanner shows no secrets, but a captured pairing code should not end up in screenshots of recents.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply { isAppearanceLightStatusBars = false; isAppearanceLightNavigationBars = false }
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        preview = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FILL_CENTER; implementationMode = PreviewView.ImplementationMode.COMPATIBLE }
        root.addView(preview, FrameLayout.LayoutParams(-1, -1))
        root.addView(Viewfinder(this, ContextCompat.getColor(this, R.color.kindred_accent)).apply { importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }, FrameLayout.LayoutParams(-1, -1))

        val bottom = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(24), 0, dp(24), dp(28)) }
        hint = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 14f; visibility = View.INVISIBLE; setPadding(dp(14), dp(8), dp(14), dp(8))
            background = android.graphics.drawable.GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setColor(0xCC202020.toInt()) }
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        bottom.addView(hint, LinearLayout.LayoutParams(-2, -2).apply { bottomMargin = dp(14) })
        bottom.addView(TextView(this).apply {
            text = getString(R.string.pairing_scan_instruction); setTextColor(Color.WHITE); textSize = 16f; gravity = Gravity.CENTER
            setShadowLayer(8f, 0f, 1f, 0x99000000.toInt())
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(16) })
        bottom.addView(button(getString(R.string.pairing_paste_link)) { finishWith(paste = true) })
        root.addView(bottom, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))

        blocked = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(32), 0, dp(32), 0); setBackgroundColor(Color.BLACK); visibility = View.GONE }
        root.addView(blocked, FrameLayout.LayoutParams(-1, -1))

        val close = MaterialButton(this, null, com.google.android.material.R.attr.materialIconButtonStyle).apply {
            setIconResource(R.drawable.ic_close); iconTint = android.content.res.ColorStateList.valueOf(Color.WHITE)
            contentDescription = getString(R.string.pairing_close); setOnClickListener { finish() }
        }
        root.addView(close, FrameLayout.LayoutParams(dp(56), dp(56), Gravity.TOP or Gravity.START).apply { setMargins(dp(8), dp(8), 0, 0) })
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val edges = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            (close.layoutParams as FrameLayout.LayoutParams).setMargins(edges.left + dp(8), edges.top + dp(8), 0, 0)
            bottom.setPadding(dp(24) + edges.left, 0, dp(24) + edges.right, dp(28) + edges.bottom)
            close.requestLayout(); insets
        }

        when {
            !packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) -> showBlocked(false)
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED -> startCamera()
            else -> permission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun button(title: String, outlined: Boolean = true, block: () -> Unit) =
        MaterialButton(this, null, if (outlined) com.google.android.material.R.attr.materialButtonOutlinedStyle else com.google.android.material.R.attr.materialButtonStyle).apply {
            text = title; isAllCaps = false; minHeight = dp(48)
            if (outlined) { setTextColor(Color.WHITE); strokeColor = android.content.res.ColorStateList.valueOf(0x99FFFFFF.toInt()) }
            setOnClickListener { block() }
        }

    private fun showBlocked(denied: Boolean) {
        blocked.removeAllViews(); blocked.visibility = View.VISIBLE
        blocked.addView(TextView(this).apply { text = getString(if (denied) R.string.pairing_camera_off else R.string.pairing_no_camera); setTextColor(Color.WHITE); textSize = 22f; gravity = Gravity.CENTER })
        blocked.addView(TextView(this).apply {
            text = getString(if (denied) R.string.pairing_camera_off_detail else R.string.pairing_no_camera_detail)
            setTextColor(0xCCFFFFFF.toInt()); textSize = 15f; gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(20))
        })
        blocked.addView(button(getString(R.string.pairing_paste_link), outlined = false) { finishWith(paste = true) }, LinearLayout.LayoutParams(-1, -2))
        if (denied) blocked.addView(button(getString(R.string.pairing_open_settings)) {
            runCatching { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))) }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = try { future.get() } catch (_: Exception) { showBlocked(false); return@addListener }
            val executor = Executors.newSingleThreadExecutor().also { analysis = it }
            val decoder = QrDecoder()
            val shown = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
            val analyzer = ImageAnalysis.Builder()
                .setResolutionSelector(ResolutionSelector.Builder().setResolutionStrategy(ResolutionStrategy(android.util.Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)).build())
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analyzer.setAnalyzer(executor) { image ->
                image.use {
                    if (delivered.get()) return@use
                    val plane = it.planes[0]
                    val text = decoder.decode(QrDecoder.pack(plane.buffer, plane.rowStride, it.width, it.height), it.width, it.height) ?: return@use
                    runOnUiThread { received(text) }
                }
            }
            try {
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, shown, analyzer)
            } catch (_: Exception) { showBlocked(false) }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun received(text: String) {
        if (isFinishing || delivered.get()) return
        if (PairingLink.looksLikePairingLink(text)) {
            delivered.set(true)
            preview.performHapticFeedback(if (android.os.Build.VERSION.SDK_INT >= 30) android.view.HapticFeedbackConstants.CONFIRM else android.view.HapticFeedbackConstants.VIRTUAL_KEY)
            finishWith(link = text)
        } else if (System.currentTimeMillis() > hintUntil) {
            // Someone else's QR code: say so briefly and keep scanning.
            hintUntil = System.currentTimeMillis() + 2500
            hint.text = getString(R.string.pairing_not_kindred); hint.visibility = View.VISIBLE
            hint.postDelayed({ if (System.currentTimeMillis() >= hintUntil) hint.visibility = View.INVISIBLE }, 2600)
        }
    }

    private fun finishWith(link: String? = null, paste: Boolean = false) {
        setResult(RESULT_OK, Intent().apply { if (link != null) putExtra(EXTRA_LINK, link); putExtra(EXTRA_PASTE, paste) })
        finish()
    }

    override fun onDestroy() { analysis?.shutdown(); super.onDestroy() }

    companion object {
        const val EXTRA_LINK = "dev.kindred.mobile.pairing_link"
        const val EXTRA_PASTE = "dev.kindred.mobile.pairing_paste"
    }
}

/** Dimmed surround, a clear rounded window and accent corner marks. */
private class Viewfinder(context: Context, accent: Int) : View(context) {
    private val density = context.resources.displayMetrics.density
    private val dim = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x80000000.toInt() }
    private val corner = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent; style = Paint.Style.STROKE; strokeWidth = 5 * density; strokeCap = Paint.Cap.ROUND }
    private val window = RectF()
    private val path = Path()

    override fun onDraw(canvas: Canvas) {
        val side = minOf(width, height) * 0.66f
        val left = (width - side) / 2f; val top = (height - side) / 2f - 40 * density
        window.set(left, top, left + side, top + side)
        val r = 28 * density
        path.reset(); path.fillType = Path.FillType.EVEN_ODD
        path.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
        path.addRoundRect(window, r, r, Path.Direction.CW)
        canvas.drawPath(path, dim)
        val arm = side * 0.16f
        val w = window
        path.reset()
        path.moveTo(w.left, w.top + r + arm); path.lineTo(w.left, w.top + r); path.quadTo(w.left, w.top, w.left + r, w.top); path.lineTo(w.left + r + arm, w.top)
        path.moveTo(w.right - r - arm, w.top); path.lineTo(w.right - r, w.top); path.quadTo(w.right, w.top, w.right, w.top + r); path.lineTo(w.right, w.top + r + arm)
        path.moveTo(w.right, w.bottom - r - arm); path.lineTo(w.right, w.bottom - r); path.quadTo(w.right, w.bottom, w.right - r, w.bottom); path.lineTo(w.right - r - arm, w.bottom)
        path.moveTo(w.left + r + arm, w.bottom); path.lineTo(w.left + r, w.bottom); path.quadTo(w.left, w.bottom, w.left, w.bottom - r); path.lineTo(w.left, w.bottom - r - arm)
        canvas.drawPath(path, corner)
    }
}
