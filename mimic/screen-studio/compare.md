# Screen Studio 대비 Recordly(개인용 Windows) 기능 비교

기준일 2026-10-13. Screen Studio 4.0.4 공식 가이드 70쪽, changelog, 홈 기능 요약 vs Recordly 코드(src, electron), ko 번역, personal 기록. 존재 여부는 grep으로 확인했고, 확인 못 한 것은 미확인(이유)으로 적었다.

**Screen Studio 기능 151개 / 있음·같음 78 / 있음·다름 37 / 없음 22 / 해당 없음(맥 전용·클라우드 등) 12 / 미확인 2**

읽는 법: 같음=기능과 위치가 거의 같음. 다름=있지만 방식·기본값·위치가 다름. 없음=코드에 없음. 해당 없음=맥 전용·클라우드·계정. SS 기본값은 공식 문서에 수치가 거의 없어 비공개로 적었다. Recordly에만 있는 기능은 맨 뒤에 따로 적었다. 근거의 영문 키(예: recording.pause)는 src/i18n/locales/ko 의 번역 키.

## 녹화

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 화면 전체(Display) 녹화 | Display 선택, 모니터를 마우스로 클릭, 멀티 모니터 | 녹화 막대 화면 목록: ko launch.json recording.screens / sourceSelector.screens | 같음 | 선택 방식이 클릭이 아니라 목록 |
| 창(Window) 녹화 | Window 클릭, 버튼 우클릭 목록, 전체화면 앱은 Display | sourceSelector.windows, windowsNote(최소화한 창은 불가) | 같음 |  |
| 영역(Area) 녹화 | 드래그 또는 크기 숫자 입력 | recording.area.select / clear (SourceSelector.tsx:76-80) 가로·세로 % 표시 | 다름 | 숫자 직접 입력 여부 미확인. 하 |
| 기기(Device) 녹화 | iPhone·iPad USB 연결, 기기 테두리 자동 | 안드로이드 USB(scrcpy): recording.android.title, electron/ipc/recording/android.ts. 실기기 시험 안 함(NOTSOLUTION A7·E9) | 다름 | iPhone 대신 안드로이드. 중 (폰 연결 시험이 먼저) |
| 기기 테두리(Device frame) | 녹화 기기에 맞는 iPhone·iPad 테두리, 편집기 Device frame 탭 | grep deviceFrame 0건 | 없음 | 안드로이드 테두리 SVG는 FEATURES.md에 계획만 있음. 하 |
| 손가락 터치 표시·터치 커서 | iPhone은 불가, Cursor type=Touch는 iPad용 | 터치 커서는 PLAN 대기열(안드로이드 시험 뒤) | 없음 | 하 |
| 카메라 선택 + 미리보기 창(녹화에 안 찍힘) | 카메라 버튼에서 장치 선택 | recording.webcam, WebcamPopover.tsx, floatingWebcamPreview.ts | 같음 |  |
| 카메라 미리보기 숨기기 | Hide camera preview | recording.hideFloatingWebcamPreview / showFloatingWebcamPreview | 같음 |  |
| 마이크 선택 + 입력 레벨 막대 | 마이크 버튼, 아래 흰 막대 | recording.microphone, a11y.microphoneLevel, MicPopover.tsx | 같음 |  |
| 시스템 오디오(전체/앱 하나/앱 묶음) | 시스템 오디오 버튼에서 선택 | recording.audioApp.title/all (녹음할 소리), 앱 이름으로 묶음. 크롬은 탭 단위 불가(NOTSOLUTION A10) | 다름 | 앱 여러 개 동시 선택은 미확인. 하 |
| 시작 전 카운트다운 | 녹화 보조 기능 | recording.countdownDelay (CountdownPopover.tsx) | 같음 |  |
| 녹화할 창 크기 맞추기 | 정확한 크기로 맞추기 | windowSize.title: 720p/1080p/16:10/세로 프리셋 4개 (RecordingSettingsPopover.tsx:107-146) | 같음 | 숫자 직접 지정은 없음. 하 |
| 바탕화면 아이콘 숨기기 | 녹화 보조 기능 | recordingSettings.hideDesktopIcons (electron/captureExtras.ts) | 같음 | 녹화 막대 톱니(녹화 설정)에 있음 |
| 녹화 직후 빠른 내보내기 위젯(저장·복사·편집) | 왼쪽 아래, Share/Save/Copy/Edit, 더블클릭=편집 | quickExport.save/copy/edit/close, doubleClickToEdit (QuickExportWidget.tsx) | 같음 | Share는 해당 없음 |
| 빠른 내보내기 설정 위치 | 녹화 선택창 오른쪽 톱니(설정 아이콘) | 빠른 내보내기 창의 톱니(quickExport.settings). 옮길지 사용자 결정 대기(E3) | 다름 | 하 |
| 최근 프로젝트 목록(녹화 창 옆) | 폴더 버튼 → 최근 프로젝트 | ProjectPopover.tsx, recording.openProject | 같음 |  |
| 일시정지·이어서 | Pause | recording.pause/resume (RecordingControls.tsx:96-105) | 같음 |  |
| 녹화 종료(Finish) | 위젯·메뉴바·Dock·전역 단축키 4가지 | 위젯 stop(RecordingControls.tsx:114) + 트레이 아이콘(electron/main.ts:557). Dock 해당 없음 | 다름 | 전역 시작/끝 단축키 없음(아래 단축키 절) |
| 녹화 다시 시작(Restart) | 위젯의 Restart | RecordingControls.tsx에 버튼 없음 | 없음 | 취소 후 다시 시작으로 대체 가능. 하 |
| 녹화 삭제(Delete) | 위젯의 Delete | recording.cancel (RecordingControls.tsx:138) | 같음 |  |
| 조작 위젯이 영상에 안 찍힘 / 숨기기 | 우클릭 Hide current recording control | recording.hideHud, hideHudFromVideo, dashboard.settings.hideHud(캡처 보호) | 같음 | 대기 중 컨트롤바는 찍힘(안내문 있음) |
| 녹화 깃발 | Ctrl+Opt+Cmd+F, 설정에서 키 변경, 타임라인에 표시 | Ctrl+Alt+F 고정(electron/ipc/register/recording.ts:7,1929), 타임라인 표시, 힌트 recording.flagHint | 다름 | 키 변경 불가. 하 |
| 스피커 노트(프롬프터) | Start Prompter 또는 Cmd+Opt+. , 속도·투명도·글자 크기, 녹화 안 찍힘 | prompter.* (PrompterWindow.tsx), 녹화 시작 시 자동 흐르기 prompter.autoFlow | 같음 | 시작 전역 단축키는 없음. 하 |
| 2초마다 자동 저장(앱이 죽어도 복구) | 디스크에 2초마다 저장 | 중단 알림 처리만 확인(recording-interrupted: electron/ipc/recording/events.ts:6, useScreenRecorder.ts:1606). 저장 주기·복구 흐름 코드 못 찾음 | 미확인 | 미확인(코드에서 저장 주기를 못 찾았고 강제 종료 시험도 안 함) |
| 알림(토스트)이 녹화에 안 찍힘 | 기본으로 안 찍힘, macOS 설정에서 허용 | Windows 토스트가 찍히는지 시험 안 함 | 미확인 | 미확인(시험 없음) |
| 말소리 없는 녹화는 마이크 음소거로 열기 | 4.0 신규 | grep 0건 | 없음 | 하 |
| 녹화·내보내기 중 종료 확인 | 4.0 신규, 종료하려 하면 확인 창 | 저장 안 한 프로젝트 확인만(electron/main.ts:843). 녹화·내보내기 중 확인 코드 못 찾음 | 없음 | 상 (녹화 중 실수로 닫으면 날아감) |
| 녹화 선택창 다시 열기 단축키 | Opt+Cmd+Enter 또는 메뉴바 아이콘 | 트레이 아이콘 클릭만(main.ts:240,415) | 다름 | 전역 단축키 없음. 중 |
| 기존 영상으로 프로젝트 만들기 | File → Create project from video(MP4) | recording.openVideoFile, 홈 가져오기(dashboard.toolbar.import) | 같음 |  |
| 녹화 후 바로 편집기로 이동 | 빠른 내보내기 위젯 끄기 옵션 | recordingSettings.openEditorAfterRecording, openEditorOnWidgetClose | 같음 |  |

## 편집기 화면

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 위쪽 줄 구성 | 폴더/휴지통, 가운데 이름, 되돌리기·다시, Presets, 패널 토글, Export(보라) | header.home/clips/export/togglePanel, 7단계(CHANGES 2026-10-08) | 같음 | 맥 창 단추 대신 Windows 단추 |
| 설정 칸 위치·아이콘 레일 | 미리보기 오른쪽 세로 아이콘 줄: Background, Cursor, Camera, Captions, Audio, Shortcuts, Motion | EditorSidebar.tsx:64-82 = 장면·줌·커서·카메라·오디오·자막·설정. 단축키는 커서 탭, 움직임은 줌 탭·설정 탭. 왼쪽/오른쪽 선택 가능(settingsSide) | 다름 | 탭 구성이 다름. 줌 탭이 따로 있음. 중하 |
| 미리보기 위 비율 선택 + Crop 버튼 | 비율 Auto 드롭다운 + Crop | EditorPreviewPanel.tsx:207, sections.crop / crop.openEditor | 같음 |  |
| 어두운 화면 + 보라 강조 | 어두운 UI | CHANGES 2026-10-08 (#5b45f5) | 같음 |  |
| 타임라인 트랙 구성 | 클립, 줌, 레이아웃, 마스크, 단축키, 깃발 | 클립 띠, 줌, 카메라 레이아웃(tim:cameraLayout), 주석(마스크 포함), 자막, 오디오, 단축키 트랙(tim:shortcuts), 깃발 표시 | 다름 | 마스크 전용 트랙과 숫자 키 4 없음(주석은 A키). 하 |
| 클립 띠(황토색, 길이·속도·파형) | 노란 막대 | Item.tsx:300,422, 7단계 완료 | 같음 |  |
| 타임라인 확대 슬라이더 | 가위 아이콘 옆 | playback.timelineZoom | 같음 | 위치는 설정 칸 왼쪽에서 끝남(X13) |
| 스크러버(드래그 속도만큼 앞뒤 재생+소리) | 타임라인 위 스크러버 | 타임라인 위 마우스 올려 보기 방식(NOTSOLUTION C23). 소리 재생 여부 미확인 | 다름 | 중 (소리로 편집점 찾는 용도) |
| JKL 재생 조작 | 있음 | grep 0건 | 없음 | 하 |
| 미리보기 옆 툴바(줌·카메라 레이아웃·마스크 추가) | 4.0 신규 | 줌 추가는 타임라인 버튼(Z). 카메라 레이아웃 추가 버튼은 PLAN 대기열 | 다름 | 하 |
| 저장했던 재생 위치에서 다시 열기 | 4.0 신규 | grep 0건 | 없음 | 하 |
| 명령 메뉴 | Cmd+K | Ctrl+K (EditorCommandMenu.tsx:57), commandMenu.* 20개 명령 | 같음 |  |
| 단축키 목록 보기 | Cmd+/ | 편집기 단축키 버튼 keyboardShortcuts.trigger | 같음 | 키 조합은 다름(Ctrl+/ 인지 미확인) |
| 현재 프레임을 이미지로 복사 | Cmd+C | Ctrl+C, preview.copyFrame (카톡 붙여넣기 시험 보류 C17) | 같음 |  |
| 실행 취소·다시 실행 | 상단 화살표 | Ctrl+Z / Ctrl+Y (useEditorGlobalInteractions.ts:60-68) | 같음 | 아이콘이 새로고침 모양(X12) |
| 미리보기 성능 설정(Quality/Performance/Power Saving) | 내보내기 옆 메뉴 | grep 0건 | 없음 | 하 (RTX 5070 기준 필요 낮음) |

## 줌

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 자동 줌(클릭 기반) | 기본 켬, 설정>Recording 의 Create zooms automatically | editorPreferences.ts autoApplyFreshRecordingAutoZooms:true, 줌 탭 effects.autoApplyFreshRecordingZooms, zoom.suggestZooms | 같음 | 설정 위치만 다름(줌 탭) |
| 줌 블록 추가·길이·삭제 | 보라 블록 클릭 추가, 가장자리 드래그, 우클릭 Disable/Remove | tim:zoom.addZoom(Z), 가장자리 드래그, set:zoom.deleteZoom | 다름 | 끄기(Disable) 없음, 삭제만. 하 |
| 줌 배율 | 슬라이더(수치 미공개) | 6단계 1.25~5x, 기본 3단계 1.8x (SettingsPanel.tsx:611-616, types.ts:724) | 다름 | 하 |
| Auto / Manual 종류 | Auto=클릭 따라감, Manual=보라 점 끌기 | zoom.modeAuto / modeManual | 같음 |  |
| 즉시 줌(Instant Animation) | 줌 설정 토글 | zoom.instantAnimation (types.ts ZoomRegion.instant) | 같음 |  |
| Glass Loupe | 유리 돋보기 | zoom.glassLoupe, tim:item.loupe. 모양은 근사(C38) | 같음 |  |
| 선명한 줌(AI 업스케일, 최대 6.5배) | 기기 안 AI | export.aiSharpen 2배, NVIDIA GPU 필요, 줌 구간만/전체 선택. 미리보기에는 없음 | 다름 | 렌즈 안 적용은 대기열. 중 |
| 줌 중 카메라가 커서 안 가림 / 줌 때 작아짐 | 기본 켬 | webcamAvoidCursor, webcamReactToZoom (types.ts DEFAULT_WEBCAM_REACT_TO_ZOOM=true) | 같음 |  |
| 항상 확대 유지(Always keep zoomed in) | 4.0에서 삭제됨 | zoom.autoFrame + 따라가는 속도 슬라이더 유지 | 다름 | SS가 없앴지만 Recordly는 유지(사용자 요청). 하 |

## 커서·움직임

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 커서 숨기기 | Hide cursor | effects.showCursor | 같음 |  |
| 커서 크기 | Cursor size | effects.cursorSize 기본 3.0 (types.ts:180) | 같음 | SS 기본값 비공개 |
| 커서 종류 | macOS / Touch | 11종(macOS, Tahoe, Windows 11, 점, 미니멀 등) effects.cursorStyleOptions. Touch 없음 | 다름 | 기본 Tahoe(types.ts:71). 하 |
| 항상 기본 시스템 커서 사용 | Always use default system cursor | grep 0건 | 없음 | 하 |
| 멈추면 숨기기 | Hide cursor if it's not moving | effects.hideIdleCursor 기본 끔, 대기 2초 (cursorExtras.ts:36-47) | 같음 | SS 기본값 미확인 |
| 커서 위치 반복(Loop) | Loop cursor position | effects.loopCursor | 같음 | 켜면 줌 추천 불가(tim:notify.zoomSuggestLoop) |
| 이동 중 커서 회전 | Rotate cursor while moving | effects.cursorSway 기본 0.4 | 같음 | 이름 다름 |
| 영상 끝에서 커서 이동 멈추기 | Stop cursor movement at the end | grep 0건 | 없음 | 하 |
| 커서 떨림 제거 | Remove cursor shakes | grep 0건 | 없음 | 하 |
| 원본 커서 종류 변화 줄이기 | Optimize original cursor types | grep 0건 | 없음 | 하 |
| 구간별 커서 숨기기 | 구간 우클릭 Hide mouse cursor | clip.hideCursor(클립 패널), tim:item.cursorHidden | 같음 | 우클릭 메뉴가 아니라 클립 패널 |
| 구간별 부드러운 이동 끄기 | Disable smooth mouse movement | grep 0건 | 없음 | 중 (드롭다운 메뉴 녹화에 필요) |
| 클릭 효과 | 조용한 원 / 새 Ripple(색 물결) | effects.cursorClickEffects: 없음/물결/스포트라이트/에코, 색·크기·불투명도·시간. 기본 없음(types.ts:74) | 다름 | SS 기본값 미확인. 중 (켜진 채 시작이 SS 느낌인지 확인) |
| 클릭 소리 선택 + 볼륨 | Cursor 탭 Click sound | effects.clickSound / clickSoundTypes 6종, 기본 끔, 볼륨 0.5 | 같음 |  |
| 모션 블러 켜기/끄기 + 강도 | Animations 탭 | effects.zoomMotionBlur 0.35, cursorMotionBlur 0.6 | 같음 |  |
| 커서 애니메이션 스타일 | Smooth / Medium / Rapid / None | effects.cursorMotionPresets(집중/부드럽게) + cursorSmoothing 0.67 슬라이더 | 다름 | 4단계 아님. 중하 |
| 화면 움직임 Focused / Smooth | Animations 탭 | effects.motionPresets.focused / smooth, 기본 focused | 같음 |  |
| 키보드 단축키 표시 | Show shortcuts, 크기, 단일 키, 트랙에서 끄기, 전체 끄기 | set:shortcuts.*, tim:shortcuts.disableAll/enableAll, 기본 꺼짐(cursorExtras.ts:36) | 같음 | 표시 위치 3곳은 추가 기능 |

## 카메라

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 카메라 레이아웃(전체/오버레이/화면만/분할) | Camera Layout | tim:cameraLayout.fullscreen/split/hidden/default, 분할 화면 2/3·1/3, 전환 0.6초 | 같음 | 세로 영상 위아래 분할은 미확인 |
| 동적 레이아웃 트랙 | 타임라인 Layouts, 자동 전환 애니 | 카메라 레이아웃 트랙(CameraLayoutTrackRow.tsx), 힌트 '눌러서 카메라 레이아웃 추가' | 같음 |  |
| 카메라 컷아웃(β) | 배경 지우고 화면 앞에 사람만 | 배경 지우기(effects.webcamRemoveBackground)는 카메라 창 모양 안에서만. 컷아웃 레이아웃은 PLAN 대기열 | 다름 | 중 (대기열 카메라 컷아웃 레이아웃) |
| 카메라 위치(3x3)·크기·둥글기·반전 | Position 3x3, Size, Roundness, Mirror | effects.webcamPosition 프리셋 + 가로·세로 직접, webcamSize 기본 40, webcamRoundness 100, webcamMirror | 같음 | 그림자·여백은 추가 기능 |
| 카메라 전체 숨기기(Hide camera) | 스위치 | 카메라 숨김 레이아웃으로 구간별 가능. 전체 숨김 스위치는 미확인 | 다름 | 하 |
| Camera aspect ratio(4.0) | Shape 대체 | 없음(너비·높이 따로 조절 effects.webcamWidth/Height) | 다름 | 하 |
| 카메라 화면 일부 자르기 | 4.0 신규 | effects.webcamCrop (WebcamCropControl.tsx) | 같음 |  |
| 얼굴 따라가기 | Face tracking | effects.webcamFaceTracking, 확대 1.3배(C29) | 같음 | 실제 웹캠 시험 안 함(E8) |
| 말 안 할 때 카메라 숨기기 | Hide during silence | effects.webcamHideWhenSilent (기준 1초) | 같음 |  |
| 색 보정 룩 12개 + 강도 + LUT 불러오기 | Camera looks | looks.* 12종+없음, intensity, importLut(.cube). 장면>프레임>룩, 카메라>룩 두 곳 | 같음 |  |
| 내 룩 프리셋 저장 | 내 프리셋 저장 | PLAN 대기열(4단계 2차) | 없음 | 하 |
| 카메라 선명하게(Sharpen) | Sharpen | looks.sharpness | 같음 |  |
| macOS 카메라 효과(배경·인물·스튜디오 조명·리액션) | 메뉴바 초록 카메라 아이콘 | macOS 시스템 기능 | 해당 없음 | Windows 대체로 배경 지우기 제공 |

## 소리

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 마이크 소리 모드 | Standard / Noise reduction / Podcast | audio.micMode 기본/잡음 제거/팟캐스트, 기본 standard(audioExtras.ts:20) | 같음 | 영상에 섞인 마이크에는 미적용(대기열). 중 |
| 시스템 오디오·마이크 따로 볼륨 | 종류별 볼륨 | audio.sourceTracksTitle (원본 시스템 소리/마이크/원본) | 같음 |  |
| 배경 음악(내장+업로드+반복+볼륨) | Audio 탭 Add background audio | audio.backgroundMusic 5곡(CC0), MP3/MP4 올리기, 볼륨 0.25, 말할 때 줄이기 기본 켬 | 같음 | 미리보기 첫 1초 버그(대기열) |
| 클립·구간 볼륨 | 우클릭 Set volume | clipEdit.setVolume (클립 단위) | 다름 | 구간을 클립 안 나누고 범위로 지정은 대기열. 하 |
| AI 보이스오버 | 로드맵 진행 중(미출시) | voiceover.* Qwen3-TTS(GPU)/Supertonic 3(CPU) | 같음 | SS보다 앞섬. Qwen 속도 결정 대기(E2) |

## 자막·대본

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 자막 생성(로컬 Whisper) | 모델 Base/Small/Medium 선택 | small 모델 고정(electron/ipc/constants.ts:17-20) + 직접 지정(captions.useCustomModel) | 다름 | Base/Medium 선택 UI 없음. 중하 |
| 자막 언어 | 자동 감지 또는 선택 | captions.languageOptions 10개(자동 포함) | 같음 |  |
| 프롬프트(제품명 등 용어) | Prompt 칸 | grep 0건 | 없음 | 중 (고유명사 오인식 줄임) |
| 자막 기본 꺼짐 | 기본 꺼짐 | DEFAULT_AUTO_CAPTION_SETTINGS.enabled=false (types.ts:677) | 같음 |  |
| 자막 수정·숨기기·크기 | Edit transcript, 숨기기, 크기 | captions.editor.* (시작·끝·나누기·합치기), captions.enabled, fontSize 30 | 같음 |  |
| 자막 스타일(글꼴·색·위치) / 한 줄·단어씩 / 등장 애니 | 4.0 신규 | fontFamily, textColor, bottomOffset 3, displayLine/Word, 애니 없음/페이드/슬라이드 업/팝 (기본 페이드) | 같음 | 애니 종류 이름 약간 다름 |
| SRT 내보내기 | 자른 부분·배속 반영 | export.captionSidecar .srt/.vtt (반영 여부 미확인) | 같음 | 자막 파일을 영상 옆에 함께 저장 |
| 클라우드 받아쓰기·Apple Speech | 4.0 클라우드, macOS 26 Apple Speech | 로컬 Whisper만 | 해당 없음 | 개인용 |
| 대본으로 편집(문장 지우면 영상 잘림) | 4.0 신규 | settings transcript.* (자막 탭 > 대본) | 같음 |  |
| 군말 지우기 | 음·어 찾아 자르기 제안 | transcript.removeFillers, 목록 transcriptEdit.ts:95-104('그·저·아' 포함 결정 대기 E5) | 같음 |  |
| 긴 침묵 줄이기(Tighten pause) | 제안 | transcript.tightenPauses, 기준 1초·남기기 0.3초(transcriptEdit.ts:29-30) | 같음 |  |
| 잘린 단어를 취소선으로 남겨 되살리기 | (SS 동작 미확인) | PLAN 대기열 | 없음 | 하 |
| 타이핑 구간 빠르게 | 자동 감지, 슬라이더, Apply (all) suggestion | clipEdit.typing*, 기본 2배(typingSpeedUp.ts:14), 제안 적용/모두 적용 | 같음 |  |

## 배경·스타일

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 배경 종류 | Wallpaper / Gradient / Color / Image / Unsplash | background.wallpaper/gradient/color/image/video + 직접 업로드. 기본 tahoe-light.jpg(lib/wallpapers.ts:43) | 다름 | 탭 순서는 SS와 같게 맞춤(CHANGES 10-08). 영상 배경은 추가 |
| Unsplash 사진 검색 | 4.0 신규 | grep 0건 | 없음 | 하 (온라인·키 필요, 개인용엔 업로드로 충분) |
| 배경화면 모음 칩(macOS·봄·노을·Radiant) | 컬렉션 칩 | 칩 없음(CHANGES 참고서비스와 달라진 점, 저작권 A5) | 다름 | 하 |
| 무작위 배경화면 | Pick random wallpaper | background.randomWallpaper | 같음 |  |
| 배경 흐림 | Background blur | background.blur | 같음 |  |
| 여백(Padding) | 0이면 배경 없음 | effects.padding 기본 20(types.ts:613), 4면 따로 조절 가능 | 같음 | SS 4.0.2는 % 로 표시 |
| 둥근 모서리 | Rounded corners | effects.radius 기본 플랫폼 값(types.ts MACOS_DEFAULT_BORDER_RADIUS_PERCENT=8) | 같음 |  |
| Inset(안쪽 프레임) | Inset | grep 0건 | 없음 | 하 |
| 그림자(각도·거리·부드러움) | 3개 조절 | effects.shadow 슬라이더 1개(기본 0.67, projectPersistence.ts:865) | 다름 | 중하 |
| 그라데이션 색 띠 줄이기 | 4.0 신규 | 디더링(CHANGES 6단계) | 같음 |  |
| 영상 크롭 | Crop 창, 크기 숫자, 크롭용 비율 | crop.title/top/bottom/left/right, 크롭 편집기 | 같음 | 크롭 전용 비율 선택은 미확인 |

## 마스크·주석

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 마스크(민감 정보 가리기) | 가린 곳 색을 따와 섞임, 크기·투명도 | annotations.blur: 흐림/모자이크(pixelate)/단색 가림 + 모양 3종 + 강도 | 다름 | 주변 색 섞기 방식은 아님(미확인). 하 |
| 하이라이트(나머지 어둡게) | 투명도 조절 | annotations.highlight / highlightOpacity (어둡기) | 같음 | 미리보기=내보내기 어둡기 확인 대기(C11) |
| 마스크·하이라이트 한 프레임에 동시 불가 | 제약 | Recordly는 주석을 여러 줄로 쌓아 겹침 허용(CHANGES 10-07) | 다름 | 더 자유로움 |
| 글자·이미지·화살표 주석 | SS는 로드맵(일시 중단) | annotations.text/image/arrow + 글꼴 추가 | 해당 없음 | SS에 없는 기능이라 비교 대상 아님(Recordly 추가) |

## 화면비·릴스

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 화면 비율 목록 | Auto / 16:9 / 9:16 / 1:1 / 4:3 / 3:4 | native, 16:9, 9:16, 1:1, 4:3, 4:5, 16:10, 10:16 + 직접 지정 (utils/aspectRatioUtils.ts:2-10). 3:4 없음, 4:5·16:10 추가 | 다름 | 하 |
| 비율 기본값 | Auto(원본) | 16:9 (projectPersistence.ts:1118-1124) | 다름 | 중 (창·영역 녹화 시 원본 비율로 시작해야 같은 느낌) |
| 비율 바꾸면 줌·레이아웃·자막 자동 재배치 | 4.0 방식 | 부분(자막 안전 영역·즉시 재그림). 줌 초점 가운데 재배치, 세로 자막 크기 남음(PLAN) | 다름 | 중 |
| Reel 모드(Off / Instagram / TikTok 덮개) | 3단계 선택 | 단일 Reels 덮개 토글 preview.reelMode (EditorPreviewPanel.tsx:95,174) | 다름 | Instagram/TikTok 선택 없음. 하 |

## 내보내기·공유

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| MP4 해상도·프레임·화질 | 720p/1080p/4K, 24/30/60fps, 품질 | 화질 낮음/보통/높음/원본/4K(업로드용), FPS 24/30/60(lib/exporter/types.ts:185-221), 인코딩 빠름/균형/고화질, NVIDIA CUDA | 다름 | 720p·1080p 표기는 빠른 내보내기 창에만. 하 |
| GIF 내보내기 | 최대 1080p, 1분 넘으면 비추천 | GIF 프레임 15~30, 크기, 반복(gifOptions.*) | 같음 | 20초 8.7MB, 16초 걸림(C41) |
| 파일로 내보내기 | Export to File | export.exportVideo, 진행 창 export.pathLabel(경로 표시) | 같음 |  |
| 클립보드로 내보내기(편집기에서) | Copy to Clipboard | 빠른 내보내기 [복사]만. 편집 효과 반영 안 됨, 카톡 붙여넣기 문제(A15). 영상 클립보드 복사는 PLAN 대기열 | 없음 | 상 (편집한 영상을 바로 붙여넣기) |
| 원본 파일 꺼내기 | Export > Extract raw recording files(화면·카메라·마이크 따로) | 홈 원본 목록에서 폴더에서 보기만. 편집기 안 추출 메뉴 없음 | 없음 | 중 |
| 공유 링크·조회수·댓글·링크 관리 | 1080p60, 30분, 비공개 | 클라우드 코드는 꺼 둠(숨김) | 해당 없음 | 개인용 오프라인 |
| 프로젝트 공유 링크(β)·팀 구독 | 최대 20GB | 없음 | 해당 없음 | 클라우드 |
| 프리셋 저장·적용 | Presets 버튼, 이름 입력, 자동 저장 | presets.* (EditorPresetMenu.tsx, 브라우저 저장소) | 같음 | 위쪽 줄 프리셋 버튼 위치 같음 |
| 프리셋 파일 공유 | Open in Finder로 파일 전달 | 파일 아님(localStorage 저장). 내보내기·가져오기 없음 | 없음 | 하 |
| 마지막 프로젝트 설정을 새 녹화 기본으로 | Editing 탭 토글 | editorPreferences.ts가 항상 저장·적용. 끄는 스위치 없음 | 다름 | 하 |

## 프로젝트·저장

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 저장·다른 이름 저장 | Cmd+S / Cmd+Shift+S | Ctrl+S / Ctrl+Shift+S (electron/main.ts:479-489), project.saveProject | 같음 | 저장 안 하고 닫으면 녹화 사라지는 문제는 수정 요청 묶음(PLAN) |
| 프로젝트 파일 형식 | 폴더 묶음 .screenstudio | 프로젝트 파일 .recordly (README) | 같음 |  |
| 닫을 때 저장 확인 | 저장/삭제 묻기 | project.unsavedChangesTitle / discardChanges | 같음 |  |
| 기본 폴더·이전 프로젝트 보기 | General 탭 | dashboard.settings.recordingsFolder / projectsFolder / showFolder | 같음 |  |
| 저장 안전(이전 버전 백업·중단 보호·덮어쓰기 방지) | 4.0 신규 | electron/ipc/project/atomicSave.ts, manager.ts | 같음 | 버전 백업 보관 개수는 미확인 |
| 프로젝트 제거=휴지통 | Remove project | electron/ipc/project/trashProjects.ts, library.movedToTrash(실행 취소 가능) | 같음 |  |
| Finder/Quick Look 미리보기 | 4.0 신규 | macOS 기능 | 해당 없음 | 탐색기 썸네일 확장은 필요 없음 |

## 단축키·명령

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 전역 녹화 시작/종료 단축키 | 온보딩에서 설정, 설정>Shortcuts에서 변경 | 없음(globalShortcut은 깃발 1개뿐: recording.ts:1929) | 없음 | 상 (녹화 중 창을 못 누르는 상황에 필요) |
| 설정>Shortcuts 탭에서 모든 단축키 변경 | 탭 하나 | 편집기 6개(줌·자르기·주석·키프레임·삭제·재생)만 변경 가능(lib/shortcuts.ts:77-82, ShortcutsConfigDialog.tsx). 녹화용은 변경 불가 | 다름 | 중 |
| 편집기 단축키 모양 | C 자르기, 4 마스크, Opt 가위, Cmd+5 Captions, Cmd+7 Audio | Z 줌, C 나누기, A 주석, F 키프레임, Ctrl+D 삭제, 스페이스 재생 | 다름 | 하 (키가 달라 SS에 익숙하면 혼동) |

## 기타

| 기능 | Screen Studio 방식(기본값·위치) | Recordly 현재(위치, 근거) | 판정 | 메모(우선순위) |
|---|---|---|---|---|
| 앱 설정 창 탭 | General / Recording / Editing / Shortcuts / Advanced | 홈 설정 아이콘(dashboard.settings.*) + 녹화 설정 팝오버 + 편집기 설정 탭(일반·움직임). 한 곳에 안 모임 | 다름 | 중하 |
| Dock 아이콘 숨기기 | Hide Dock Icon | macOS Dock. Windows는 작업표시줄 옵션(skipTaskbar) | 해당 없음 |  |
| iPhone 미러링 녹화 | macOS 15+ Window 모드 | macOS 기능 | 해당 없음 |  |
| 활성화·라이선스·계정·이메일 변경 | 로그인·구독 | 로그인 창·계정 숨김 | 해당 없음 | 개인용 |
| 진단 정보 공유·지원 | Advanced 탭 | 없음(오류 제보 버튼 숨김) | 해당 없음 |  |
| 설치·시스템 요구·권한 안내 | macOS 권한 | Windows 권한 문구만 남음(lau:permissions) | 해당 없음 |  |
| Raycast 확장 | Raycast | 없음 | 해당 없음 | 맥 앱 연동 |
| 오프라인 우선·전부 기기 안 처리 | 원칙 | 로컬만(클라우드 숨김). 단 처음 쓸 때 모델 내려받기(자막·AI·배경 지우기) | 같음 |  |

## Recordly에만 있는 것 (비교 대상 아님)

주석(글자·이미지·화살표·여러 모양), 클릭 효과 스포트라이트·에코, 커서 11종 스타일·스프링 조절, 줌 모션 세부(인/아웃 시간·곡선·연결 줌), 안드로이드 USB 녹화, 영상 배경화면, 4면 따로 여백, 클립 라이브러리·홈 대시보드(폴더·원본/프로젝트), 한국어 UI, 오디오 싱크 보정 메뉴(블루투스 값), AI 배경 지우기 고품질(BiRefNet), 확장 기능 자리.

## 빠진 것 우선순위 목록 (없음·다름 중 할 만한 것)

상에서 하 순서. 완료 기준은 다 됐을 때 화면에 무엇이 보이는지. 마지막 칸은 personal/PLAN.md 미룬 기능 대기열에 이미 있는지 표시.

| 순위 | 우선순위 | 항목 | 완료 기준 | PLAN.md 대기열 여부 |
|---|---|---|---|---|
| 1 | 상 | 전역 녹화 시작/종료 단축키 (설정에서 변경 가능) | 다른 창이 앞에 있어도 키 한 번으로 녹화가 시작·종료되고, 설정 창에서 키를 바꾸면 바뀐 키로 동작 | 대기열에 없음(새로 발견) |
| 2 | 상 | 편집기 클립보드로 내보내기 (편집 효과 포함, 카톡·문서에 붙여넣기) | 내보내기 메뉴에 클립보드로 복사가 있고 누르면 편집한 영상이 Ctrl+V로 붙음 | 대기열에 있음: 영상 클립보드 복사(카톡 복사 해결 뒤) |
| 3 | 상 | 녹화·내보내기 중 앱 닫기 확인 창 | 녹화 중이나 내보내기 중에 창을 닫으려 하면 계속할까요 확인 창이 뜸 | 대기열에 없음(새로 발견) |
| 4 | 중 | 비율 기본값을 원본(Auto)으로, 비율 바꿀 때 줌·카메라·자막 자동 재배치 마무리 | 창 녹화를 열면 원본 비율로 시작하고, 9:16으로 바꾸면 줌 초점이 가운데로 다시 맞춰짐 | 대기열에 있음: 자동 재배치 부분 완료(줌 초점·세로 자막 크기 남음). 기본값은 새로 발견 |
| 5 | 중 | 구간별 부드러운 마우스 이동 끄기 | 타임라인 구간 하나를 골라 스위치를 켜면 그 구간 커서가 원본처럼 직선으로 움직임 | 대기열에 없음 |
| 6 | 중 | 자막 프롬프트 칸(제품명 등 용어) + Whisper 모델 Base/Small/Medium 선택 | 자막 탭에 프롬프트 입력칸과 모델 3종 선택이 있고, 용어를 넣으면 고유명사가 바르게 나옴 | 대기열에 없음 |
| 7 | 중 | 원본 파일 꺼내기 (화면·카메라·마이크 트랙 따로) | 내보내기 메뉴 원본 파일 꺼내기를 누르고 폴더를 고르면 트랙별 파일이 생김 | 대기열에 없음(3단계 계획에 있었으나 오디오 분리만 구현됨) |
| 8 | 중 | 카메라 컷아웃 레이아웃 (창 모양 없이 사람만 화면 위에) | 레이아웃에서 컷아웃을 고르면 카메라 창 테두리 없이 사람만 화면 앞에 보임 | 대기열에 있음(웹캠 필요 E8) |
| 9 | 중 | 스크러버를 SS식으로 (드래그 속도만큼 소리 나며 앞뒤 재생) | 타임라인 위를 천천히 끌면 소리가 느리게 나오며 재생됨 | 대기열에 없음(C23 확인 대기) |
| 10 | 중 | 클릭 효과 기본값 점검 (지금 기본 없음) | 새 프로젝트를 열면 SS처럼 클릭마다 물결이 보임(켜는 쪽으로 정할지 사용자 결정) | 대기열에 없음 |
| 11 | 중 | 마이크가 영상에 섞인 녹화에도 마이크 모드 적용 | 별도 마이크 파일이 없는 녹화에서도 잡음 제거 선택이 소리에 반영됨 | 대기열에 있음(5단계 2차) |
| 12 | 중 | 녹화용 단축키(깃발·시작·창 다시 열기)를 설정에서 변경 + 편집기 키를 SS와 맞출지 결정 | 설정에서 깃발 키를 바꾸면 바뀐 키로 깃발이 꽂히고, 단축키 목록에 녹화 키도 보임 | 대기열에 없음 |
| 13 | 중 | 줌 블록 끄기(Disable) / 우클릭 메뉴 | 줌 블록 우클릭에 끄기가 있고 끄면 그 줌만 건너뜀 | 대기열에 없음 |
| 14 | 중 | AI 글자 선명화 렌즈 안 적용·미리보기 반영 | 줌한 글자가 Glass Loupe 렌즈 안에서도 선명함 | 대기열에 있음(Glass Loupe AI) |
| 15 | 하 | Inset(안쪽 프레임), 그림자 각도·거리·부드러움 | 그림자 설정에 각도·거리·부드러움 슬라이더가 있고 Inset 슬라이더로 안쪽 틀이 생김 | 대기열에 없음 |
| 16 | 하 | Instagram/TikTok 덮개 선택, 3:4 Tall 비율 | 릴스 모드에서 Instagram·TikTok을 고를 수 있고 비율 목록에 3:4가 있음 | 대기열에 없음 |
| 17 | 하 | 커서 부가 옵션 (기본 시스템 커서, 끝에서 이동 멈춤, 떨림 제거, 원본 종류 최적화, Touch 종류, 애니메이션 4단계) | 커서 탭 고급에 위 항목 스위치가 있음 | 터치 커서만 대기열에 있음 |
| 18 | 하 | 미리보기 성능 모드 (Quality/Performance/Power Saving) | 내보내기 옆 메뉴에서 모드를 바꾸면 미리보기 프레임이 달라짐 | 대기열에 없음 |
| 19 | 하 | 프리셋 파일 내보내기·가져오기, 내 룩 프리셋 저장 | 프리셋 메뉴에서 파일로 저장·불러오기가 되고 룩도 내 프리셋으로 저장됨 | 룩 프리셋만 대기열에 있음 |
| 20 | 하 | JKL 재생, 재생 위치 복원, 녹화 다시 시작, 마이크 무음 시 음소거 시작 | J/K/L로 재생 속도가 바뀌고, 프로젝트를 다시 열면 저장한 재생 위치에서 시작 | 대기열에 없음 |
| 21 | 하 | Unsplash 배경, 배경화면 모음 칩 | 배경 탭에서 검색한 사진을 배경으로 고름 | 대기열에 없음(온라인·키 필요) |
| 22 | 하 | 안드로이드 실기기 시험·기기 테두리·터치 커서 | 폰을 USB로 연결해 녹화하면 터치 표시가 보이고 폰 테두리 안에 들어감 | 대기열에 있음(휴대폰 연결 필요 E9) |

미확인 항목은 코드에서 근거를 못 찾았거나 시험이 필요한 것이다(자동 저장 주기, 알림 캡처). 우선순위는 개인용·Windows·오프라인 기준이며, 사용자 신호 전에는 작업을 시작하지 않는다.
