import groovy.json.JsonSlurper
import java.io.File

plugins {
    kotlin("multiplatform") version "2.2.21"
    kotlin("plugin.serialization") version "2.2.21"
    id("com.android.application") version "8.10.1"
    id("org.jetbrains.compose") version "1.9.2"
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.21"
}

private fun readDotEnvValue(dotEnvFile: File, key: String): String? {
    if (!dotEnvFile.exists()) return null

    val prefix = "$key="
    for (raw in dotEnvFile.readLines()) {
        val line = raw.trim()
        if (line.isBlank() || line.startsWith("#")) continue
        val normalized = line.removePrefix("export ").trim()
        if (!normalized.startsWith(prefix)) continue

        var value = normalized.removePrefix(prefix).trim()
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1)
        } else {
            value = value.substringBefore(" #").substringBefore("#").trim()
        }
        if (value.isNotBlank()) return value
    }
    return null
}

private fun readJsonConfigValue(jsonFile: File, key: String): String? {
    if (!jsonFile.exists()) return null

    val parsed = JsonSlurper().parseText(jsonFile.readText(Charsets.UTF_8).removePrefix("\uFEFF"))
    return (parsed as? Map<*, *>)
        ?.get(key)
        ?.toString()
        ?.takeIf { it.isNotBlank() }
}

val clerkKey =
    (project.findProperty("CLERK_PUBLISHABLE_KEY") as String?)
        ?: (project.findProperty("VITE_CLERK_PUBLISHABLE_KEY") as String?)
        ?: System.getenv("CLERK_PUBLISHABLE_KEY")
        ?: System.getenv("VITE_CLERK_PUBLISHABLE_KEY")
        ?: readJsonConfigValue(rootProject.file("../env.json"), "CLERK_PUBLISHABLE_KEY")
        ?: readJsonConfigValue(rootProject.file("../env.json"), "VITE_CLERK_PUBLISHABLE_KEY")
        ?: readJsonConfigValue(rootProject.file("../env_dev.json"), "CLERK_PUBLISHABLE_KEY")
        ?: readJsonConfigValue(rootProject.file("../env_dev.json"), "VITE_CLERK_PUBLISHABLE_KEY")
        ?: readDotEnvValue(rootProject.file("../.env"), "CLERK_PUBLISHABLE_KEY")
        ?: readDotEnvValue(rootProject.file("../.env"), "VITE_CLERK_PUBLISHABLE_KEY")
        ?: ""

kotlin {
    jvmToolchain(17)
    androidTarget()

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.materialIconsExtended)

                implementation("io.ktor:ktor-client-core:2.3.9")
                implementation("io.ktor:ktor-client-content-negotiation:2.3.9")
                implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.9")

                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
            }
        }

        val androidMain by getting {
            dependencies {
                implementation("androidx.activity:activity-compose:1.9.2")
                implementation("androidx.core:core-ktx:1.13.1")
                implementation("androidx.datastore:datastore-preferences:1.1.1")
                implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
                implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.4")
                implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")

                implementation("io.ktor:ktor-client-okhttp:2.3.9")

                // Clerk Android SDK (Android only)
                implementation("com.clerk:clerk-android:0.1.24")

                // HTML parsing/sanitization + reader highlighting
                implementation("org.jsoup:jsoup:1.17.2")

                // PDF text extraction (for TTS / search parity with web)
                implementation("com.tom-roush:pdfbox-android:2.0.27.0")
            }
        }

        val androidUnitTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation("junit:junit:4.13.2")
                // Needed for XmlPullParserFactory on the JVM (Android provides this at runtime).
                implementation("net.sf.kxml:kxml2:2.3.0")
                implementation("org.jsoup:jsoup:1.17.2")
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
            }
        }

        val androidInstrumentedTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation("androidx.test.ext:junit:1.3.0")
                implementation("androidx.test:runner:1.7.0")
                implementation("androidx.test.espresso:espresso-core:3.7.0")
            }
        }
    }
}

android {
    namespace = "com.progressivereader.kmp"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.progressivereader.kmp"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        val escaped = clerkKey.replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "CLERK_PUBLISHABLE_KEY", "\"$escaped\"")
        buildConfigField("boolean", "AUTH_CONFIGURED", clerkKey.isNotBlank().toString())
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
    }

    testOptions {
        animationsDisabled = true
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }.configureEach {
    doFirst {
        check(clerkKey.isNotBlank()) {
            "Release builds require CLERK_PUBLISHABLE_KEY (or VITE_CLERK_PUBLISHABLE_KEY)."
        }
    }
}

dependencies {
    androidTestImplementation("androidx.compose.ui:ui-test-junit4-android:1.9.4")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.9.4")
}

configurations.all {
    // Clerk uses Custom Tabs; pin browser to avoid dependency mismatches.
    resolutionStrategy.force("androidx.browser:browser:1.8.0")
}
