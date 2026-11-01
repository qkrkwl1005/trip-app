export type TripItemCategory = 'PLACE' | 'CAFE' | 'FOOD' | 'SHOP';

export type TripItem = {
  id: string;
  name: string;
  address: string;
  category: TripItemCategory;
  lat: number | null;
  lng: number | null;
  day: number;
  note?: string;
  sourceUrl?: string;
  done?: boolean;
  aliases?: string[];
  imageUrl?: string;
};

export type TripDetail = {
  id: string;
  title: string;
  meta: string;
  note: string;
};

export type TripData = {
  title: string;
  start: string;
  end: string;
  flights: TripDetail[];
  stays: TripDetail[];
  notes: TripDetail[];
};

export type RoomMember = {
  role: 'owner' | 'editor';
  name: string;
  email?: string;
};

export type TripRoom = {
  items: TripItem[];
  trip: TripData;
  ownerUid: string;
  members: Record<string, RoomMember>;
  revision: number;
  settings?: {
    darkMode?: boolean;
    googleMapsUrl?: string;
    naverMapsUrl?: string;
    myMapsUrl?: string;
  };

};

export type AppSettings = {
  linkImportEndpoint: string;
  googleMapsApiKey: string;
  naverMapsApiKey: string;
  googleMyMapsUrl: string;
  aiProviderKey: string;
  geminiApiKey: string;
  openRouterApiKey: string;
  groqApiKey: string;
  openAiApiKey: string;
};

export type RoomConflict = {
  roomId: string;
  baseRevision: number;
  remoteRevision: number;
  localItems: TripItem[];
  remoteItems: TripItem[];
};
