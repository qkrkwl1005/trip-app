import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { TripData, TripItem, TripRoom } from '../types/trip';

type RoomPatch = { items?: TripItem[]; trip?: TripData };

export function subscribeToRoom(
  roomId: string,
  onChange: (room: TripRoom) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
    if (!snapshot.exists()) {
      onError(new Error('공유 방을 찾지 못했어요.'));
      return;
    }
    onChange(snapshot.data() as TripRoom);
  }, (error) => onError(error));
}

export async function updateRoom(roomId: string, revision: number, patch: RoomPatch) {
  const roomRef = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) throw new Error('공유 방을 찾지 못했어요.');
    const current = snapshot.data() as TripRoom;
    if (current.revision !== revision) throw new Error('다른 사용자의 변경이 있어요. 화면을 새로고침한 뒤 다시 시도해 주세요.');
    transaction.update(roomRef, { ...patch, revision: revision + 1, updatedAt: serverTimestamp() });
  });
}

export async function createRoom(trip: TripData): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('로그인이 필요해요.');
  const roomId = `${currentUser.uid.slice(0, 6)}-${Date.now().toString(36)}`;
  await setDoc(doc(db, 'rooms', roomId), {
    items: [],
    trip,
    ownerUid: currentUser.uid,
    members: { [currentUser.uid]: { role: 'owner', name: currentUser.displayName || '여행자', email: currentUser.email || '' } },
    settingsShared: false,
    settings: {},
    revision: 0,
    history: [],
    updatedAt: serverTimestamp(),
  });
  return roomId;
}
