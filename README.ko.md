# sqlite-tool

[中文](README.zh-CN.md) | [English](README.md) | [Français](README.fr.md) | [日本語](README.ja.md) | 한국어

sqlite-tool은 VS Code용 SQLite 데이터베이스 시각화 도구입니다. `.db`, `.sqlite`, `.sqlite3` 파일을 열면 편집기 안에서 테이블 탐색, 데이터 확인과 편집, 테이블 생성, SQL 실행을 바로 할 수 있습니다.


![sqlite-tool screenshot](https://raw.githubusercontent.com/lx544690189/SQLite-Tool/main/snapshot/main.png)

## 기능

- 별도 설정 없이 SQLite 데이터베이스 파일을 사용자 지정 편집기로 엽니다.
- 테이블 목록, 행 수, 페이지네이션된 데이터, 정렬 결과를 확인합니다.
- 전체 필드 또는 선택한 필드에서 데이터를 검색합니다.
- NULL 처리, 기본 키 보호, 삭제 확인과 함께 행을 추가, 편집, 삭제합니다.
- CREATE SQL 보기, 테이블 이름 변경, 폼을 통한 새 테이블 생성을 지원합니다.
- Monaco SQL 편집기에서 조회 및 쓰기 SQL을 실행하고 결과와 실행 기록을 확인합니다.
- VS Code 밝은/어두운 테마를 따르며, 도구 안에서 수동으로 테마를 바꿀 수 있습니다.
- VS Code의 기본 미저장 상태와 `Ctrl/Cmd+S` 저장 흐름으로 변경 사항을 디스크에 기록합니다.

## 설치

`.vsix` 패키지가 있다면 다음 명령으로 설치할 수 있습니다.

```bash
code --install-extension sqlite-tool-2.0.0.vsix
```

VS Code 확장 보기에서 "Install from VSIX..."를 선택해 설치할 수도 있습니다.

## 사용법

1. VS Code 탐색기에서 `.db`, `.sqlite`, `.sqlite3` 파일을 엽니다.
2. 파일은 자동으로 `sqlite-tool` 편집기로 열립니다.
3. 왼쪽에서 테이블을 선택해 데이터를 탐색, 검색, 편집합니다.
4. SQL을 실행해야 할 때 SQL 실행기로 전환합니다.
5. 변경 후 편집기 탭에 미저장 상태가 표시됩니다. `Ctrl/Cmd+S`를 눌러 데이터베이스 파일에 기록합니다.

## 설정

sqlite-tool은 인터페이스 언어 설정을 지원합니다.

- `Auto`: VS Code 표시 언어를 따릅니다.
- `Chinese` / `English` / `French` / `Japanese` / `Korean`: 언어를 직접 선택합니다.

VS Code 설정에서 `sqlite-tool`을 검색하거나 도구 안의 설정 패널에서 언어, 테마, 기본 페이지 크기, SQL 편집기 글꼴 크기를 조정할 수 있습니다.

## 참고

- 중요한 데이터베이스를 편집하기 전에 백업을 유지하세요.
- 기본 키가 없고 `rowid`도 지원하지 않는 테이블은 탐색만 가능하며 행 단위 편집 또는 삭제를 할 수 없습니다.
- 파일이 외부에서 변경된 경우 sqlite-tool은 저장 전에 경고하여 외부 변경 사항을 덮어쓰지 않도록 도와줍니다.

## 개발자 문서

개발, 아키텍처, 자체 점검, 패키징 설명은 [docs/开发者指南.md](docs/开发者指南.md)에 있습니다.

## License

MIT
