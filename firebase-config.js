// ⚠️ 보안 조치 (Google Cloud Console에서 직접 설정):
// 1. API 및 서비스 → 사용자 인증 정보 → 이 키 → 애플리케이션 제한사항 → HTTP 리퍼러 추가
//    https://qkrkwl1005.github.io/*
// 2. Firebase Console → Authentication → Settings → Authorized domains 에
//    qkrkwl1005.github.io 등록 (localhost는 테스트 시에만)
// 3. API 제한: Identity Toolkit API, Firestore API 등 필요한 것만 허용
window.TRIPSYNC_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDGp6JRQ-IJ3aZkdSV0NY85K15L2CauNEY',
  authDomain: 'trip-app-802b8.firebaseapp.com',
  projectId: 'trip-app-802b8',
  storageBucket: 'trip-app-802b8.firebasestorage.app',
  messagingSenderId: '344102140871',
  appId: '1:344102140871:web:03d584e810f4487eb7b7e2',
  googleClientId: '344102140871-ftn7afdqu0r6ol41mlj5uigs45jps6bl.apps.googleusercontent.com'
};
