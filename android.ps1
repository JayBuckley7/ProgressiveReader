[CmdletBinding()]
param(
    [ValidateSet("doctor", "verify", "test", "lint", "build", "install", "connectedTest", "clean")]
    [string]$Action = "verify"
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$kmpRoot = Join-Path $repoRoot "kmp"

function Test-JavaHome([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    $javaExecutable = Join-Path $Path "bin\java.exe"
    if (-not (Test-Path -LiteralPath $javaExecutable)) { return $false }

    $versionLine = & $javaExecutable --version 2>$null | Select-Object -First 1
    if ($versionLine -notmatch '(?:openjdk|java)\s+(?:version\s+)?"?(?<major>\d+)') { return $false }
    return [int]$Matches.major -ge 17
}

function Find-JavaHome {
    $candidates = @(
        $env:JAVA_HOME,
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot"
    )

    foreach ($candidate in $candidates) {
        if (Test-JavaHome $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
    }

    $adoptiumRoot = "C:\Program Files\Eclipse Adoptium"
    if (Test-Path -LiteralPath $adoptiumRoot) {
        $discovered =
            Get-ChildItem -LiteralPath $adoptiumRoot -Directory |
            Where-Object { $_.Name -match '^jdk-(17|18|19|2[0-9])' } |
            Sort-Object Name -Descending |
            Select-Object -First 1
        if ($null -ne $discovered -and (Test-JavaHome $discovered.FullName)) {
            return $discovered.FullName
        }
    }

    throw "No Java 17+ JDK found. Install Android Studio or an Adoptium JDK."
}

function Find-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    )

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $adb = Join-Path $candidate "platform-tools\adb.exe"
        if (Test-Path -LiteralPath $adb) { return (Resolve-Path -LiteralPath $candidate).Path }
    }

    throw "Android SDK not found. Install it from Android Studio's SDK Manager."
}

$javaHome = Find-JavaHome
$androidSdk = Find-AndroidSdk
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk

$javaVersion = & (Join-Path $javaHome "bin\java.exe") --version | Select-Object -First 1
Write-Host "Java: $javaHome ($javaVersion)"
Write-Host "Android SDK: $androidSdk"

if ($Action -eq "doctor") {
    $adb = Join-Path $androidSdk "platform-tools\adb.exe"
    & $adb devices -l
    exit $LASTEXITCODE
}

if ($Action -in @("install", "connectedTest") -and [string]::IsNullOrWhiteSpace($env:ANDROID_SERIAL)) {
    $adb = Join-Path $androidSdk "platform-tools\adb.exe"
    $emulatorSerial =
        (& $adb devices) |
        Where-Object { $_ -match '^emulator-\d+\s+device$' } |
        ForEach-Object { ($_ -split '\s+')[0] } |
        Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($emulatorSerial)) {
        throw "No running Android emulator found. Start an AVD before $Action."
    }
    $env:ANDROID_SERIAL = $emulatorSerial
    Write-Host "Device: $emulatorSerial"
}

$gradleTasks = @(
    switch ($Action) {
        "verify" { ":composeApp:testDebugUnitTest"; ":composeApp:lintDebug"; ":composeApp:assembleDebug" }
        "test" { ":composeApp:testDebugUnitTest" }
        "lint" { ":composeApp:lintDebug" }
        "build" { ":composeApp:assembleDebug" }
        "install" { ":composeApp:installDebug" }
        "connectedTest" { ":composeApp:connectedDebugAndroidTest" }
        "clean" { ":composeApp:clean" }
    }
)

Push-Location $kmpRoot
try {
    & .\gradlew.bat --console=plain --stacktrace @gradleTasks
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
