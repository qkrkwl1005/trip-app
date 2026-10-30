# TripSync Master

여행 장소·음식·쇼핑을 한 곳에서 관리하는 정적 웹 앱입니다.

## 기능
- 장소/음식/쇼핑 항목 검색 및 저장
- 릴스 하나에 여러 장소를 묶어 저장하고 지도에서 개별 핀 및 전체 장소 펼쳐보기
- 지도(OpenStreetMap/Google Maps) 표시
- Gemini AI 기반 인터넷 검색 (API 키 선택)
- 대표 사진 자동 찾기 (Wikipedia/Wikimedia)
- 메모, 완료 체크, 백업/복원
- 모바일 반응형 + PWA (오프라인 캐시)
- 현재 위치 표시

## 로컬 실행
```bash
python3 -m http.server 8765
# http://localhost:8765
```

## 친구들과 실시간 공유 설정

이 앱은 기본적으로 브라우저의 로컬 저장소에 데이터를 저장합니다. 친구들과 같은 일정을 함께 편집하려면 Firebase Firestore 공유 방을 설정하세요.

### 1. Firebase 프로젝트 만들기

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만듭니다.
2. **Authentication → Sign-in method → Anonymous**를 활성화합니다.
3. **Firestore Database → Create database**를 만들고, 처음에는 테스트 모드로 시작해도 됩니다.
4. 프로젝트 설정(톱니바퀴) → **Your apps → Web 앱 추가**에서 앱을 등록합니다.
5. 표시되는 `firebaseConfig` 값을 [firebase-config.js](./firebase-config.js)에 붙여 넣습니다. `apiKey`는 웹에 공개되어도 되는 식별자이며 비밀번호가 아닙니다.

### 2. Firestore 보안 규칙 설정

테스트 모드는 기간이 지나면 만료되므로 다음 규칙으로 바꾸는 것을 권장합니다. 이 앱은 익명 로그인 사용자만 방 데이터를 읽고 쓸 수 있게 합니다.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3. 배포 및 사용

1. `index.html`, `manifest.json`, `sw.js`, `firebase-config.js`를 함께 정적 호스팅에 올립니다. 로컬 파일(`file://`)로는 Firebase가 정상 동작하지 않으므로 GitHub Pages, Netlify, Vercel 중 하나를 사용하세요.
2. 앱에서 **설정 → 친구들과 실시간 공유 → 공유 방 만들기**를 누릅니다.
3. 생성된 URL을 친구들에게 보냅니다.
4. 같은 링크를 연 친구가 장소를 추가하거나 메모·완료 상태를 바꾸면 다른 사람 화면에도 자동 반영됩니다.
5. AI 키와 지도 키도 함께 쓰려면 방을 만든 기기에서 **현재 API·지도 설정 공유**를 한 번 누릅니다. 공유된 키는 방 참여자에게 공개되므로 개인 키 대신 제한된 키를 사용하세요.

방 링크를 가진 사람은 편집할 수 있으므로 신뢰할 수 있는 친구에게만 공유하세요. 현재 구현은 익명 로그인 기반이며, 방별 초대/읽기 전용 권한이 필요하면 Firebase 계정 로그인과 별도 권한 모델을 추가해야 합니다.

공유 방에는 장소 데이터와 함께 AI 제공자 키, 지도 API 키, 지도/프록시 설정이 저장될 수 있습니다. 키를 공유한 뒤에는 사용량·결제 한도를 제공자 콘솔에서 제한하고, 더 이상 사용하지 않을 때 키를 폐기하거나 교체하세요.
