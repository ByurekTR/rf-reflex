plugins {
    id("com.android.application")
}

android {
    namespace = "com.byurek.rfreflex"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.byurek.rfreflex"
        minSdk = 26
        // 34 on purpose: the app is a single full-screen WebView and relies on the classic
        // back-button callback and non-edge-to-edge layout.
        targetSdk = 34
        versionCode = 4
        versionName = "1.3"
    }

    signingConfigs {
        // A fixed sideload key committed to the repo, so every build has the same signature and
        // installs over the previous one without wiping progress. It is NOT secret.
        create("sideload") {
            storeFile = rootProject.file("keystore/sideload.jks")
            storePassword = "rfreflex"
            keyAlias = "sideload"
            keyPassword = "rfreflex"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("sideload")
        }
        debug {
            signingConfig = signingConfigs.getByName("sideload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
