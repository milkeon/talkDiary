import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// React Native 환경에서는 기본 gRPC 스트림이 불안정해서 long polling으로 강제 전환합니다.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// 음성 파일은 Firebase Storage(유료 Blaze 플랜 필요) 대신 기기 로컬 저장소에 보관합니다.
// (src/services/diaryService.ts 참고)
