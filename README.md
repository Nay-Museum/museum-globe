# Museum Globe | 동시대 유물 지구본

한국과 중국의 박물관 소장품을 같은 세기에서 비교하는 정적 웹사이트 프로토타입입니다. 지구본의 점이나 목록을 선택하면 사진, 연대, 재질, 소장처, 공식 출처를 볼 수 있습니다. 현재 대상은 국립중앙박물관과 **중국 베이징 고궁박물원**입니다.

공개 사이트: <https://nay-museum.github.io/museum-globe/> (소개: [`#about`](https://nay-museum.github.io/museum-globe/#about))

장기 목표는 세계 주요 박물관으로 비교 범위를 넓히는 것입니다. 현재 구현은 두 박물관과 12세기 비교용 데이터에 집중되어 있습니다.

## 바로 실행하기

필수: Python 3, WebGL을 지원하는 최신 브라우저. 빌드, npm 설치, 로그인, API 키, 데이터베이스는 필요하지 않습니다.

```bash
git clone https://github.com/Nay-Museum/museum-globe.git
cd museum-globe
python3 -m http.server 4173 --bind 127.0.0.1
```

브라우저에서 <http://localhost:4173/>을 엽니다. 서버 종료는 터미널에서 `Ctrl+C`입니다. 포트가 사용 중이면 `4174`로 실행하고 접속 주소도 변경합니다. macOS에서는 Python 3가 설치되어 있을 때 `start.command`로도 실행할 수 있습니다.

저장소 루트에 `index.html`이 있습니다. 이미 이 폴더를 열었다면 `cd museum-globe`를 다시 실행하지 않습니다. 유물 이미지는 공식 박물관 원격 URL을 사용하므로 사진 표시에는 인터넷 연결이 필요합니다.

## 다른 개발자와 AI를 위한 시작점

먼저 [AGENTS.md](AGENTS.md)를 읽습니다. 이어서 필요한 문서를 확인합니다.

| 문서 | 내용 |
| --- | --- |
| [구조와 동작](docs/ARCHITECTURE.md) | 파일 역할, 로드 순서, 필터와 선택 흐름 |
| [데이터 설명](docs/DATA.md) | 필드 정의, 출처, 연대·위치의 한계, 재수집 주의사항 |
| [개발 우선순위](docs/ROADMAP.md) | 다음 작업과 완료 기준 |

다른 AI에는 다음처럼 요청하면 됩니다.

> 이 저장소의 AGENTS.md, README.md, docs/ARCHITECTURE.md, docs/DATA.md, docs/ROADMAP.md를 먼저 읽고 현재 구현과 데이터 한계를 파악해 주세요. node scripts/check.mjs로 기준 상태를 확인한 다음, 요청한 기능을 구현하고 검증 결과를 알려 주세요.

## 현재 기능과 데이터

- 실제 지도 텍스처의 3D 지구본, 드래그 회전, 휠 줌, 자동 회전 토글
- 5C~19C 슬라이더, 데이터가 있는 세기 이동, 문화권·분류·이름 검색
- 지구본 점과 비교 목록의 선택, 사진과 공식 출처를 포함한 상세 패널
- 상단 `소개`·`About` 링크의 소개 창: 한국어 `소개` 탭(사이트 설명과 보는 방법, `#intro`)과 영어 `About` 탭(데이터 출처·연대·위치의 한계, `#about`)
- 총 **892점**: 12세기 비교군 789점(한국 733 / 중국 56) + 백자·청화백자 표본 103점(국립중앙박물관 20, 고궁박물원 20, The Met 37, V&A 26)
- 도자 종류(청자·백자·청화백자) 필터, 상세의 연대 근거·소장처 표시
- 상단 `한국어`/`EN` 전환: 화면 문구와 왕조·위치·재질 등 고정 어휘를 영어로 표시. 유물 이름은 각 박물관 기록 그대로

**789점 전체를 12세기로 확정한 데이터는 아닙니다.** 한국 23점은 `dateLabel`에 12세기가 표기되어 있고, 나머지 710점은 공식 상세에 세기가 명시되지 않은 고려 청자를 비교 목적으로 12세기에 배치했습니다. 중국 자료도 북송·남송·송 분류에 12세기와 겹치는 비교 범위를 적용했습니다. 이 수치는 수집 결과의 분류이며, 개별 유물의 학술 검증 결과가 아닙니다.

현재 모든 유물 위치는 `capital-fallback`입니다. 공통 추정 좌표를 시각적으로 분산해 표시하므로 실제 출토지·제작지 지도처럼 해석하면 안 됩니다. 공식 링크 연결, 소장처 확인 플래그, 이미지 라이선스 문자열에도 개별 재검증이 필요합니다. 자세한 내용은 [데이터 설명](docs/DATA.md)에 있습니다.

## 점검과 변경

개발 점검에는 **Node.js 22 이상**을 사용합니다. 실행 자체에는 Node.js가 필요하지 않습니다.

```bash
node scripts/check.mjs
```

외부 요청 없이 JavaScript 문법, 데이터 구조, ID 중복, 소장처 연결, URL 형태, 필수 로컬 파일을 확인하고 개수와 알려진 한계를 출력합니다. GitHub Actions에서도 같은 명령을 실행합니다. 통과 결과가 외부 링크·사진의 실시간 가용성이나 연대·소장처·권리 검증을 의미하지는 않습니다.

화면을 수정한 경우 아래 항목을 직접 확인합니다.

- [ ] 초기 12C, 검색어 없음, 양국 활성화, 분류 전체에서 `789점` 표시
- [ ] 한국만 남기면 `733점`, 중국만 남기면 `56점` 표시 (백자·청화백자는 12세기와 겹치지 않음)
- [ ] 15C에서 도자 종류 `백자`·`청화백자` 필터와 V&A·The Met 유물 상세 표시
- [ ] 지구본 드래그, 휠 줌, 좌상단 자동 회전 토글 동작
- [ ] 점 또는 목록 선택 시 상세와 팝오버 표시, 닫기 동작
- [ ] 공식 이미지 로드와 출처 링크 확인; 일부 원격 이미지는 접근 제한 가능
- [ ] 이름 검색, 분류 변경, 빈 결과, 세기 이동 시 선택 해제 동작
- [ ] `소개`·`About` 링크와 `#intro`·`#about` 직접 접속으로 해당 탭 열기, 탭 전환, 닫기 버튼·Esc·배경 클릭으로 닫기
- [ ] `한국어`/`EN` 전환 시 문구·목록·상세가 바뀌고 새로고침 후에도 선택 언어 유지 (영어에서는 개수가 `789 objects`)
- [ ] 데스크톱·모바일에서 글자 겹침과 콘솔 오류 확인

개수는 현재 스냅샷 기준입니다. 데이터를 의도적으로 바꿀 때는 문서의 기준 개수와 `index.html`의 About 문구(건수·연대·위치 설명)도 함께 갱신합니다.

### 데이터 갱신

앱 데이터는 `data/artifacts.js`에 있습니다. 구조는 [데이터 설명](docs/DATA.md)을 따릅니다. 수집 스크립트는 수천 개의 공식 페이지에 요청하고 이 파일을 **직접 덮어씁니다**. 실행이나 배포에 필요한 단계가 아니며, 준비 없이 실행하지 않습니다.

```bash
# 데이터 갱신 작업을 의도한 경우에만, 기존 스냅샷을 커밋한 뒤 실행
node scripts/collect-official-artifacts.mjs
node scripts/check.mjs
git diff -- data/artifacts.js
```

백자·청화백자 표본은 `node scripts/collect-porcelain-sample.mjs`로 모읍니다. 이 도구는 검토 파일(`review/porcelain-candidates.json`)만 쓰고 앱 데이터는 바꾸지 않습니다. 자세한 기준은 [데이터 설명](docs/DATA.md)에 있습니다.

수집기는 전체 박물관 소장품을 전수 조사하지 않습니다. 검색 상한, 필터, 건너뛴 오류 때문에 재실행 개수와 순서는 바뀔 수 있습니다. 앱이나 데이터 파일을 바꾸면 `index.html`의 해당 `?v=` 값을 갱신하고 브라우저를 새로고침합니다.

## 배포 가이드

현재 저장소는 `museum-globe` 폴더 내부를 저장소 루트로 사용합니다. 아래 설정도 이 **독립 저장소의 루트 `.`** 기준입니다. 부모 폴더 전체를 호스팅할 때만 하위 디렉터리 `museum-globe`를 루트로 지정합니다.

### Netlify Drop

1. 로컬 실행과 점검을 완료합니다.
2. [Netlify Drop](https://app.netlify.com/drop)을 엽니다.
3. `index.html`이 바로 들어 있는 `museum-globe` 폴더를 업로드합니다.
4. 생성된 주소에서 지구본·이미지·검색을 확인합니다.
5. 갱신할 때는 같은 사이트의 배포 화면에 수정한 폴더를 다시 올립니다.

빌드 과정은 없습니다. 공식 절차: [Netlify 수동 배포](https://docs.netlify.com/deploy/create-deploys/). 무료 제공 범위와 사용량 한도는 가입 시 해당 서비스에서 확인합니다.

### Git 저장소를 연결하는 호스팅

| 설정 | Vercel | Netlify |
| --- | --- | --- |
| Git 저장소 | `Nay-Museum/museum-globe` | `Nay-Museum/museum-globe` |
| 프로젝트 루트 / Base directory | `.` (저장소 루트) | 비움 (저장소 루트) |
| Framework preset | `Other` | 별도 프레임워크 없음 |
| Build command | Override를 켜고 빈 값 | 비움 |
| Output / Publish directory | `.` | `.` |
| Install command | Override를 켜고 빈 값 | 설치 불필요 |
| 환경변수 | 없음 | 없음 |

Vercel 공식 설정: [빌드 및 출력 폴더](https://vercel.com/docs/builds/configure-a-build). 연속 배포를 연결하면 이후 `main` 푸시가 서비스 배포로 이어질 수 있으므로 사이트 설정을 확인합니다.

### GitHub Pages

이 저장소를 올리는 것과 웹사이트를 공개하는 것은 별도 작업입니다. Pages를 쓰려면 저장소의 **Settings > Pages > Deploy from a branch**에서 `main`, `/ (root)`를 선택하고 저장합니다. 정적 파일 그대로 제공하려면 루트에 빈 `.nojekyll` 파일을 추가합니다. 완료 후 Pages 설정에 표시된 주소로 접속합니다.

공식 절차: [GitHub Pages 사이트 생성](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site). 현재의 `docs/`는 개발 문서 폴더이며, Pages의 배포 폴더로 선택하지 않습니다.

### 배포 후 확인과 문제 해결

- 개발자 도구 Network에서 `index.html`, `css/style.css`, `js/app.js`, `data/*.js`, `vendor/globe.gl.min.js`, `img/earth-blue-marble.jpg`의 정상 응답을 확인합니다. 캐시 사용 시 `304`도 정상입니다.
- `404` 또는 스타일 깨짐: `index.html`이 배포 루트에 있는지, 파일 이름과 대소문자·상대 경로가 맞는지 확인합니다.
- `0점`: 12C·검색어 없음·양국·분류 전체인지 확인하고 데이터 스크립트와 콘솔 오류를 확인합니다. 현재 스냅샷은 다른 세기에 비어 있을 수 있습니다.
- 지구본이 비어 있음: WebGL/하드웨어 가속, 번들 스크립트, 텍스처 로드를 확인합니다.
- 사진만 실패: 공식 이미지 URL의 변경, 지연 또는 외부 연결 제한을 확인합니다. 출처 페이지가 열리는지도 별도로 확인합니다.
- 이전 데이터가 보임: 강력 새로고침과 `index.html`의 파일 버전 값을 확인한 뒤 필요하면 호스팅 캐시를 갱신합니다.

## 자료와 외부 의존성

- 런타임: `vendor/globe.gl.min.js`의 Globe.gl 2.46.1 번들. 상위 프로젝트: [globe.gl](https://github.com/vasturiano/globe.gl).
- 지도: `three-globe` 예제에서 가져온 로컬 `img/earth-blue-marble.jpg`를 사용합니다. [원본 예제 자료](https://github.com/vasturiano/three-globe/tree/master/example/img).
- 소장품: [국립중앙박물관](https://www.museum.go.kr/), [베이징 고궁박물원](https://www.dpm.org.cn/), 개별 출처는 각 데이터의 `source`에 있습니다.
- `img/`에는 이전 데이터에서 쓰던 유물 이미지도 남아 있습니다. 현재 유물 데이터는 공식 원격 이미지를 사용합니다.

© 2026 Nayun Kim. All rights reserved. 이 저장소의 코드·화면 구성·문서·글은 저작권자의 서면 허락 없이 복제·수정·배포할 수 없습니다. 자세한 범위는 [LICENSE](LICENSE)에 있습니다. 박물관 유물 기록·이미지와 외부 라이브러리(Globe.gl, 지구 텍스처)는 이 조건에 포함되지 않고 각자의 이용 조건을 따릅니다.
