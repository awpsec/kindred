plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val pushConfigured = file("google-services.json").exists()
if (pushConfigured) apply(plugin = "com.google.gms.google-services")
android {
    namespace = "dev.kindred.mobile"
    compileSdk = 36
    defaultConfig {
        applicationId = "dev.kindred.mobile"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-preview"
        buildConfigField("boolean", "PUSH_CONFIGURED", pushConfigured.toString())
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildTypes { release { isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") } }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.window:window:1.4.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("com.google.android.material:material:1.13.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // On-device QR pairing: CameraX preview/analysis and ZXing's pure-Java decoder. No Play services or network scanner.
    implementation("androidx.camera:camera-camera2:1.5.3")
    implementation("androidx.camera:camera-lifecycle:1.5.3")
    implementation("androidx.camera:camera-view:1.5.3")
    implementation("com.google.zxing:core:3.5.4")
    implementation(platform("com.google.firebase:firebase-bom:34.4.0"))
    implementation("com.google.firebase:firebase-messaging")
    testImplementation("junit:junit:4.13.2")
    // Android's org.json is a stub in local JVM tests.
    testImplementation("org.json:json:20250517")
}
