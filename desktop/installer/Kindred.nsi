Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
Name "Kindred"
OutFile "Kindred-${VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Kindred"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetDatablockOptimize on
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Kindred"
VIAddVersionKey /LANG=1033 "FileDescription" "Kindred Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Kindred contributors"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "banner.bmp"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Kindred"
!define MUI_WELCOMEPAGE_TEXT "Install or update Kindred ${VERSION} on this computer.$\r$\n$\r$\nYour profiles, settings, and local server data will be kept.$\r$\n$\r$\nIf Microsoft Edge WebView2 is missing, setup will install it. This requires an internet connection."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Kindred is ready"
!define MUI_FINISHPAGE_TEXT "Kindred ${VERSION} is installed. Open Kindred to connect to a server or set up your own local workspace."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Kindred"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenKindred
!insertmacro MUI_PAGE_FINISH
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Remove the Kindred application from this computer? Your profiles, settings, downloaded models, and local server data will be kept."
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
Var RegistryKey
Var Options
Var NoShortcuts
Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Kindred requires 64-bit Windows."
    SetErrorLevel 1
    Abort
  ${EndIf}
  ${GetParameters} $Options
  ${GetOptions} $Options "/NOSHORTCUTS" $NoShortcuts
  ${IfNot} ${Errors}
    StrCpy $NoShortcuts "-NoShortcuts"
  ${Else}
    StrCpy $NoShortcuts ""
  ${EndIf}
FunctionEnd
Function OpenKindred
  ExecShell "open" "$INSTDIR\Launch.vbs"
FunctionEnd
Section "Kindred"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "package.zip"
  File "stable.json"
  File "update-public-key.xml"
  File "MicrosoftEdgeWebview2Setup.exe"
  File "Install-Package.ps1"
  retry:
  DetailPrint "Checking the package and installing Kindred ${VERSION}..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\Install-Package.ps1" -InstallRoot "$INSTDIR" $NoShortcuts'
  Pop $0
  ReadINIStr $1 "$PLUGINSDIR\result.ini" "Result" "Message"
  ${If} $0 == 20
    IfSilent failed
    MessageBox MB_RETRYCANCEL|MB_ICONINFORMATION "$1" IDRETRY retry
    Goto failed
  ${EndIf}
  ${If} $0 != 0
    IfSilent failed
    MessageBox MB_OK|MB_ICONSTOP "$1"
    Goto failed
  ${EndIf}
  ReadINIStr $RegistryKey "$PLUGINSDIR\result.ini" "Result" "RegistryKey"
  CopyFiles /SILENT "$PLUGINSDIR\Install-Package.ps1" "$INSTDIR\Uninstall-Package.ps1"
  WriteUninstaller "$INSTDIR\Uninstall-Kindred.exe"
  SetRegView 64
  WriteRegStr HKCU "$RegistryKey" "DisplayName" "Kindred"
  WriteRegStr HKCU "$RegistryKey" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "$RegistryKey" "DisplayIcon" "$INSTDIR\versions\${VERSION}\Kindred.exe,0"
  WriteRegStr HKCU "$RegistryKey" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "$RegistryKey" "UninstallString" '$\"$INSTDIR\Uninstall-Kindred.exe$\"'
  WriteRegStr HKCU "$RegistryKey" "QuietUninstallString" '$\"$INSTDIR\Uninstall-Kindred.exe$\" /S'
  WriteRegDWORD HKCU "$RegistryKey" "NoModify" 1
  WriteRegDWORD HKCU "$RegistryKey" "NoRepair" 1
  SetErrorLevel 0
  Goto done
  failed:
    DetailPrint "$1"
    ${If} $0 == "error"
      StrCpy $0 1
    ${EndIf}
    SetErrorLevel $0
    Abort
  done:
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  retry:
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Uninstall-Package.ps1" -InstallRoot "$INSTDIR" -Action Remove'
  Pop $0
  ReadINIStr $1 "$INSTDIR\result.ini" "Result" "Message"
  ${If} $0 == 20
    IfSilent failed
    MessageBox MB_RETRYCANCEL|MB_ICONINFORMATION "$1" IDRETRY retry
    Goto failed
  ${EndIf}
  ${If} $0 != 0
    IfSilent failed
    MessageBox MB_OK|MB_ICONSTOP "$1"
    Goto failed
  ${EndIf}
  ReadINIStr $RegistryKey "$INSTDIR\result.ini" "Result" "RegistryKey"
  SetRegView 64
  DeleteRegKey HKCU "$RegistryKey"
  Delete "$INSTDIR\result.ini"
  Delete "$INSTDIR\Uninstall-Package.ps1"
  Delete "$INSTDIR\Uninstall-Kindred.exe"
  RMDir "$INSTDIR\versions"
  RMDir "$INSTDIR\staging"
  SetErrorLevel 0
  Goto done
  failed:
    SetErrorLevel 1
    Abort
  done:
SectionEnd
