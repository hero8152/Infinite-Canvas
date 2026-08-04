#define MyAppName "Infinite Canvas"
#define MyAppPublisher "Infinite Canvas"
#define MyAppExeName "Infinite Canvas.exe"
#define MyAppIcon "..\..\..\build\icons\infinite-canvas.ico"
#ifndef MyAppVersion
#define MyAppVersion "0.0.0"
#endif

[Setup]
AppId={{8A1D924E-3776-41DE-95AB-F85CDA0B42D8}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\InfiniteCanvas
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile={#MyAppIcon}
OutputDir=..\..\..\dist\windows
OutputBaseFilename=Infinite Canvas 安装程序
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequiredOverridesAllowed=dialog
DisableDirPage=no
UsePreviousAppDir=yes
UninstallDisplayName={#MyAppName} {#MyAppVersion}
VersionInfoVersion={#MyAppVersion}

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Files]
Source: "..\..\..\dist\windows\Infinite Canvas.exe"; DestDir: "{app}"; DestName: "Infinite Canvas.exe"; Flags: ignoreversion
Source: "..\..\..\dist\windows\Infinite Canvas Updater.exe"; DestDir: "{app}"; DestName: "Infinite Canvas Updater.exe"; Flags: ignoreversion
Source: "..\..\..\dist\windows\Infinite Canvas Service\*"; DestDir: "{app}\Infinite Canvas Service"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\payload\app-base.zip"; DestDir: "{app}\bootstrap"; Flags: ignoreversion
Source: "..\payload\manifest.json"; DestDir: "{app}\bootstrap"; Flags: ignoreversion

[INI]
Filename: "{app}\install-meta.ini"; Section: "paths"; Key: "storage_root"; String: "{code:GetStorageRoot}"

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
var
  StoragePage: TInputDirWizardPage;
  RemoveDataOnUninstall: Boolean;
  KeepDataOnUninstall: Boolean;
  CachedStorageRoot: String;

function StorageRootDefault(Param: String): String;
begin
  Result := ExpandConstant('{localappdata}\InfiniteCanvas');
end;

function GetStorageRoot(Param: String): String;
begin
  Result := Trim(StoragePage.Values[0]);
  if Result = '' then
    Result := StorageRootDefault('');
end;

procedure InitializeWizard;
var
  PreviousStorageRoot: String;
begin
  PreviousStorageRoot := GetPreviousData('StorageRoot', StorageRootDefault(''));
  StoragePage :=
    CreateInputDirPage(
      wpSelectDir,
      '数据与运行时目录',
      '选择存储目录',
      '此目录用于保存 runtime、数据、日志与备份。默认放在当前用户的 LocalAppData 下。',
      False,
      ''
    );
  StoragePage.Add('');
  StoragePage.Values[0] := PreviousStorageRoot;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = StoragePage.ID then
  begin
    if Trim(StoragePage.Values[0]) = '' then
    begin
      MsgBox('必须选择一个存储目录。', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'StorageRoot', GetStorageRoot(''));
end;

function LoadInstalledStorageRoot(): String;
begin
  Result := GetIniString('paths', 'storage_root', '', ExpandConstant('{app}\install-meta.ini'));
  if Trim(Result) = '' then
    Result := StorageRootDefault('');
end;

function AskUninstallDataChoice(): Boolean;
var
  PromptForm: TSetupForm;
  TitleText: TNewStaticText;
  HintText: TNewStaticText;
  KeepRadio: TNewRadioButton;
  RemoveRadio: TNewRadioButton;
  NextButton: TNewButton;
  CancelButton: TNewButton;
begin
  Result := False;
  PromptForm := CreateCustomForm(ScaleX(420), ScaleY(180), True, True);
  try
    PromptForm.Caption := '卸载数据处理';

    TitleText := TNewStaticText.Create(PromptForm);
    TitleText.Parent := PromptForm;
    TitleText.Left := ScaleX(16);
    TitleText.Top := ScaleY(16);
    TitleText.Width := ScaleX(388);
    TitleText.Height := ScaleY(20);
    TitleText.Caption := '请选择是否保留 Infinite Canvas 的数据目录';

    HintText := TNewStaticText.Create(PromptForm);
    HintText.Parent := PromptForm;
    HintText.Left := ScaleX(16);
    HintText.Top := ScaleY(44);
    HintText.Width := ScaleX(388);
    HintText.Height := ScaleY(36);
    HintText.Caption := '存储目录包含 runtime、数据、日志与备份。两个选项默认都不勾选，必须选择一个后才能继续。';
    HintText.WordWrap := True;

    KeepRadio := TNewRadioButton.Create(PromptForm);
    KeepRadio.Parent := PromptForm;
    KeepRadio.Left := ScaleX(16);
    KeepRadio.Top := ScaleY(92);
    KeepRadio.Width := ScaleX(388);
    KeepRadio.Caption := '保留数据';

    RemoveRadio := TNewRadioButton.Create(PromptForm);
    RemoveRadio.Parent := PromptForm;
    RemoveRadio.Left := ScaleX(16);
    RemoveRadio.Top := ScaleY(118);
    RemoveRadio.Width := ScaleX(388);
    RemoveRadio.Caption := '不保留数据';

    NextButton := TNewButton.Create(PromptForm);
    NextButton.Parent := PromptForm;
    NextButton.Left := PromptForm.ClientWidth - ScaleX(180);
    NextButton.Top := PromptForm.ClientHeight - ScaleY(36);
    NextButton.Width := ScaleX(75);
    NextButton.Caption := '下一步';
    NextButton.ModalResult := mrOk;
    NextButton.Default := True;

    CancelButton := TNewButton.Create(PromptForm);
    CancelButton.Parent := PromptForm;
    CancelButton.Left := PromptForm.ClientWidth - ScaleX(96);
    CancelButton.Top := PromptForm.ClientHeight - ScaleY(36);
    CancelButton.Width := ScaleX(75);
    CancelButton.Caption := '取消';
    CancelButton.ModalResult := mrCancel;
    CancelButton.Cancel := True;

    while True do
    begin
      if PromptForm.ShowModal <> mrOk then
        Exit;
      if not (KeepRadio.Checked or RemoveRadio.Checked) then
      begin
        MsgBox('请先选择“保留数据”或“不保留数据”。', mbError, MB_OK);
        continue;
      end;
      KeepDataOnUninstall := KeepRadio.Checked;
      RemoveDataOnUninstall := RemoveRadio.Checked;
      Result := True;
      Exit;
    end;
  finally
    PromptForm.Free;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  CachedStorageRoot := LoadInstalledStorageRoot();
  KeepDataOnUninstall := False;
  RemoveDataOnUninstall := False;
  Result := AskUninstallDataChoice();
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and RemoveDataOnUninstall then
  begin
    if DirExists(CachedStorageRoot) then
      DelTree(CachedStorageRoot, True, True, True);
  end;
end;
