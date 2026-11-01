import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../firebaseConfig';
import { RoomConflict, TripData, TripItem, TripRoom } from '../types/trip';

export type RoomPatch = { items?: TripItem[]; trip?: TripData; settings?: TripRoom['settings'] };
const OFFLINE_QUEUE_KEY = 'trippin-offline-queue';
const PENDING_CONFLICT_KEY = 'trippin-pending-conflict';

type OfflineChange = {
  roomId: string;
  baseRevision: number;
  baseItems: TripItem[];
  patch: RoomPatch;
};

function normalizeRoom(data: Partial<TripRoom>): TripRoom {
  const trip = (data.trip && typeof data.trip === 'object' ? data.trip : {}) as Partial<TripData>;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    trip: {
      title: typeof trip.title === 'string' ? trip.title : '',
      start: typeof trip.start === 'string' ? trip.start : '',
      end: typeof trip.end === 'string' ? trip.end : '',
      flights: Array.isArray(trip.flights) ? trip.flights : [],
      stays: Array.isArray(trip.stays) ? trip.stays : [],
      notes: Array.isArray(trip.notes) ? trip.notes : [],
    },
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    members: data.members && typeof data.members === 'object' ? data.members : {},
    revision: typeof data.revision === 'number' ? data.revision : 0,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  };
}

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

    onChange(normalizeRoom(snapshot.data() as Partial<TripRoom>));
  }, (error) => onError(error));
}

export async function fetchRoom(roomId: string): Promise<TripRoom> {
  const snapshot = await getDoc(doc(db, 'rooms', roomId));
  if (!snapshot.exists()) throw new Error('공유 방을 찾지 못했어요.');
  return normalizeRoom(snapshot.data() as Partial<TripRoom>);
}

export async function joinRoom(roomId: string): Promise<TripRoom> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('로그인이 필요해요.');
  const roomRef = doc(db, 'rooms', roomId);
  let joinedRoom: TripRoom | null = null;
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) throw new Error('공유 방을 찾지 못했어요.');
    const room = normalizeRoom(snapshot.data() as Partial<TripRoom>);
    const existing = room.members[currentUser.uid];
    if (!existing) {
      transaction.update(roomRef, {
        [`members.${currentUser.uid}`]: {
          role: 'editor',
          name: currentUser.displayName || '여행자',
          email: currentUser.email || '',
        },
        updatedAt: serverTimestamp(),
      });
      room.members = {
        ...room.members,
        [currentUser.uid]: {
          role: 'editor',
          name: currentUser.displayName || '여행자',
          email: currentUser.email || '',
        },
      };
    }
    joinedRoom = room;
  });
  if (!joinedRoom) throw new Error('방 참여에 실패했어요.');
  return joinedRoom;
}

export async function updateRoom(roomId: string, revision: number, patch: RoomPatch, baseItems: TripItem[] = []) {
  const roomRef = doc(db, 'rooms', roomId);
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('공유 방을 찾지 못했어요.');
      const current = snapshot.data() as Partial<TripRoom>;
      if (current.revision !== revision) throw new Error('다른 사용자의 변경이 있어요. 화면을 새로고침한 뒤 다시 시도해 주세요.');
      transaction.update(roomRef, { ...patch, revision: revision + 1, updatedAt: serverTimestamp() });
    });
  } catch (error) {
    if (!isTransientError(error)) throw error;
    await enqueueOfflineChange({ roomId, baseRevision: revision, baseItems, patch });
    throw new Error('네트워크가 불안정해 변경을 기기에 저장했어요. 연결되면 자동 동기화합니다.');
  }
}

function isTransientError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return /unavailable|deadline|network|offline|aborted|failed-precondition/i.test(`${code} ${message}`);
}

async function enqueueOfflineChange(change: OfflineChange) {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  const queue: OfflineChange[] = raw ? JSON.parse(raw) as OfflineChange[] : [];
  const next = queue.filter((item) => item.roomId !== change.roomId);
  next.push(change);
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
}

function mergeItems(base: TripItem[], local: TripItem[], remote: TripItem[]) {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const merged: TripItem[] = [];
  const conflicts: Array<{ local: TripItem; remote: TripItem }> = [];
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  ids.forEach((id) => {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const localChanged = JSON.stringify(b ?? null) !== JSON.stringify(l ?? null);
    const remoteChanged = JSON.stringify(b ?? null) !== JSON.stringify(r ?? null);
    if (localChanged && remoteChanged && JSON.stringify(l ?? null) !== JSON.stringify(r ?? null)) {
      if (l && r) conflicts.push({ local: l, remote: r });
      return;
    }
    const selected = localChanged ? l : r;
    if (selected) merged.push(selected);
  });
  return { merged, conflicts };
}

export async function flushOfflineQueue(roomId: string): Promise<{ status: 'empty' | 'synced' | 'conflict'; conflict?: RoomConflict }> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return { status: 'empty' };
  const queue = JSON.parse(raw) as OfflineChange[];
  const change = queue.find((item) => item.roomId === roomId);
  if (!change) return { status: 'empty' };
  const snapshot = await getDoc(doc(db, 'rooms', roomId));
  if (!snapshot.exists()) throw new Error('공유 방을 찾지 못했어요.');
  const remote = normalizeRoom(snapshot.data() as Partial<TripRoom>);
  const localItems = change.patch.items ?? change.baseItems;
  if (remote.revision !== change.baseRevision && change.patch.items) {
    const result = mergeItems(change.baseItems, localItems, remote.items);
    if (result.conflicts.length) {
      const conflict: RoomConflict = {
        roomId,
        baseRevision: change.baseRevision,
        remoteRevision: remote.revision,
        localItems,
        remoteItems: remote.items,
      };
      await AsyncStorage.setItem(PENDING_CONFLICT_KEY, JSON.stringify(conflict));
      return { status: 'conflict', conflict };
    }
    await updateRoom(roomId, remote.revision, { ...change.patch, items: result.merged });
  } else {
    await updateRoom(roomId, remote.revision, change.patch);
  }
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.filter((item) => item !== change)));
  return { status: 'synced' };
}

export async function resolvePendingConflict(useLocal: boolean) {
  const raw = await AsyncStorage.getItem(PENDING_CONFLICT_KEY);
  if (!raw) return;
  const conflict = JSON.parse(raw) as RoomConflict;
  await updateRoom(conflict.roomId, conflict.remoteRevision, { items: useLocal ? conflict.localItems : conflict.remoteItems });
  await AsyncStorage.removeItem(PENDING_CONFLICT_KEY);
  const queued = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (queued) {
    const queue = JSON.parse(queued) as OfflineChange[];
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.filter((item) => item.roomId !== conflict.roomId)));
  }
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
