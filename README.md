# 여행플래너

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
2. **Authentication → Sign-in method → Google**을 활성화합니다.
3. **Firestore Database → Create database**를 만들고, 처음에는 테스트 모드로 시작해도 됩니다.
4. 프로젝트 설정(톱니바퀴) → **Your apps → Web 앱 추가**에서 앱을 등록합니다.
5. 표시되는 `firebaseConfig` 값을 [firebase-config.js](./firebase-config.js)에 붙여 넣습니다. `apiKey`는 웹에 공개되어도 되는 식별자이며 비밀번호가 아닙니다.
6. **Authentication → Settings → Authorized domains**에 실제 사용 주소를 추가합니다. GitHub Pages라면 `qkrkwl1005.github.io`를 추가하세요. 모바일에서는 팝업 대신 Google 로그인 페이지로 이동한 뒤 앱으로 돌아옵니다.

### 2. Firestore 보안 규칙 설정

테스트 모드는 기간이 지나면 만료되므로 다음 규칙으로 바꾸세요. 저장소의 [firestore.rules](./firestore.rules)와 같은 내용입니다. Google 로그인 사용자 중 방 멤버만 접근할 수 있고, 일정 데이터와 방장이 공유한 API·지도 설정만 저장되도록 필드를 제한합니다.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      function isMember(data) {
        return request.auth != null
          && data.members[request.auth.uid].role in ['owner', 'editor'];
      }
      function validRoom(data) {
        return data.keys().hasOnly(['items', 'updatedAt', 'ownerUid', 'members', 'settings', 'settingsShared', 'revision', 'history'])
          && data.items is list
          && data.items.size() <= 200
          && data.ownerUid is string
          && data.members is map
          && data.settingsShared is bool
          && data.settings is map
          && data.revision is number
          && data.history is list
          && data.history.size() <= 10;
      }
      allow read: if isMember(resource.data);
      allow create: if request.auth != null
        && validRoom(request.resource.data)
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.members[request.auth.uid].role == 'owner';
      allow update: if isMember(resource.data)
        && validRoom(request.resource.data)
        && request.resource.data.ownerUid == resource.data.ownerUid
        && (request.auth.uid == resource.data.ownerUid
          || (
            request.resource.data.members == resource.data.members
            && request.resource.data.settingsShared == resource.data.settingsShared
            && request.resource.data.settings == resource.data.settings
          ));
      allow delete: if request.auth != null
        && resource.data.ownerUid == request.auth.uid;
    }
  }
}
```

Firebase CLI를 사용하는 경우 프로젝트에서 다음 명령으로 규칙을 게시할 수 있습니다.

```bash
firebase deploy --only firestore:rules
```

저장소의 **Actions → Deploy Firestore rules → Run workflow**로 규칙을 배포하려면 GitHub 저장소에 다음 Actions Secret을 추가하세요.

- `FIREBASE_PROJECT_ID`: `trip-app-802b8`
- `FIREBASE_SERVICE_ACCOUNT`: Firebase 프로젝트용 서비스 계정 JSON 전체

이 워크플로는 자동 실행되지 않으며, 규칙을 변경해 게시할 때 수동으로 실행합니다.

### 3. 배포 및 사용

1. `index.html`, `manifest.json`, `sw.js`, `firebase-config.js`를 함께 정적 호스팅에 올립니다. 로컬 파일(`file://`)로는 Firebase가 정상 동작하지 않으므로 GitHub Pages, Netlify, Vercel 중 하나를 사용하세요.
2. 앱에서 **설정 → 친구들과 실시간 공유 → 공유 방 만들기**를 누릅니다.
3. 생성된 URL을 친구들에게 보냅니다.
4. 같은 링크를 연 친구가 장소를 추가하거나 메모·완료 상태를 바꾸면 다른 사람 화면에도 자동 반영됩니다.
5. 방장이 입력한 AI·지도 설정은 공유 방에서 자동으로 승인 멤버에게 전달됩니다. 친구가 링크를 열고 로그인하면 별도 입력 없이 같은 설정을 사용합니다.

방 소유자는 설정 화면에서 친구의 Google 사용자 ID를 승인해야 합니다. 일반 멤버는 일정 데이터를 수정할 수 있지만 다른 멤버를 승인하거나 방을 삭제할 수 없습니다.

설정 화면에서 현재 참여자 이름과 역할을 확인할 수 있으며, 방 소유자는 공유 방 삭제도 할 수 있습니다. API·지도 설정은 공유 방에서 자동으로 승인 멤버에게 전달됩니다. API 키를 공유하면 멤버의 브라우저에 저장되므로, Google Cloud와 각 AI 제공자에서 도메인·사용량 제한을 설정하세요.

친구는 공유 링크를 연 뒤 **방장에게 참여 요청**을 누르면 사용자 ID를 직접 복사해 전달하지 않아도 됩니다. 방장은 참여 요청에서 **승인**을 누를 수 있고, 현재 참여자 목록의 **삭제** 버튼으로 멤버를 내보낼 수 있습니다. 공유 일정은 최근 10개 변경을 보관하며, **마지막 변경 되돌리기**로 복원할 수 있습니다. 동시에 수정하면 먼저 저장된 변경을 보호하고 충돌 안내를 표시합니다.
