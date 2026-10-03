package dev.kindred.mobile

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer

/** On-device QR decoding of a camera luminance (Y) plane with ZXing core. No frames leave the phone. */
class QrDecoder {
    // MultiFormatReader (limited to QR) is the reader that honors ALSO_INVERTED.
    private val reader = MultiFormatReader().apply {
        setHints(mapOf(
            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
            // Dark-theme screens may draw light modules on a dark background.
            DecodeHintType.ALSO_INVERTED to true,
        ))
    }

    /** [luminance] is tightly packed `width * height` bytes. Returns the text, or null when no QR code is readable. */
    fun decode(luminance: ByteArray, width: Int, height: Int): String? {
        if (width <= 0 || height <= 0 || luminance.size < width * height) return null
        val source = PlanarYUVLuminanceSource(luminance, width, height, 0, 0, width, height, false)
        return try { reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text }
            catch (_: ReaderException) { null }
            catch (_: IllegalArgumentException) { null }
            finally { reader.reset() }
    }

    companion object {
        /** Copies a plane with row padding into a packed buffer. */
        fun pack(plane: java.nio.ByteBuffer, rowStride: Int, width: Int, height: Int): ByteArray {
            val out = ByteArray(width * height)
            val buffer = plane.duplicate().apply { rewind() }
            if (rowStride == width && buffer.remaining() >= out.size) { buffer.get(out); return out }
            val row = ByteArray(rowStride)
            for (y in 0 until height) {
                buffer.position(y * rowStride)
                val count = minOf(rowStride, buffer.remaining())
                buffer.get(row, 0, count)
                System.arraycopy(row, 0, out, y * width, minOf(width, count))
            }
            return out
        }
    }
}
