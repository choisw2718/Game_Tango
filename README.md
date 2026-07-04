# Tango

Tango는 6x6 또는 8x8 보드에서 같은 원이 3개 연속되지 않도록 채우고, 각 행과 열의 검은 원/빈 원 개수를 맞추며, 인접 칸의 `=` 또는 `x` 조건을 만족시키는 정적 웹 퍼즐 게임입니다.

이 폴더는 GitHub Pages에 바로 올릴 수 있는 완성된 정적 사이트입니다. 서버, 백엔드, DB, WebSocket 없이 `index.html`, CSS, JavaScript, 정적 JSON 데이터만으로 동작합니다.

## 업로드 방법

1. GitHub 저장소 `choisw2718/Game_Tango`를 엽니다.
2. 이 폴더 안의 파일과 폴더를 저장소 루트에 그대로 업로드합니다.
   - `index.html`
   - `assets/`
   - `data/`
   - `.nojekyll`
   - `README.md`
3. 커밋 메시지는 예를 들어 `Deploy static Tango game`으로 저장합니다.

## GitHub Pages 설정

저장소의 **Settings > Pages**에서 다음처럼 설정합니다.

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

배포 후 예상 주소는 다음 형식입니다.

```text
https://choisw2718.github.io/Game_Tango/
```

## 다시 배포하는 방법

게임 파일이나 퍼즐 데이터를 수정한 뒤 새 정적 배포본을 만들고, 이 저장소 루트의 기존 파일을 같은 구조로 덮어 올리면 됩니다.

이 배포본에는 플레이용 공개 퍼즐 데이터만 포함되어 있으며, 원본 SQLite DB나 베타 테스트/개발 서버 파일은 포함되어 있지 않습니다.
