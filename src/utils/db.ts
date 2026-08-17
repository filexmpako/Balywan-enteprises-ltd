const DB_NAME = 'HasidadiPhotosDB';
const DB_VERSION = 1;
const STORE_NAME = 'ownerWorkPhotos';

export interface WorkPhoto {
  id: string;
  ownerId: string;
  imageData: string; // base64 string
  caption?: string;
  uploadedAt: string;
  // Extended field to distinguish avatar photos from workplace photos or receipts
  // within the same IndexedDB object store, avoiding schema duplication.
  photoType?: 'avatar' | 'workplace' | 'receipt';
}

export function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open photo IndexedDB database.'));
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Create an index for querying photos by ownerId
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
    };
  });
}

export async function savePhoto(ownerId: string, imageData: string, caption?: string, photoType: 'avatar' | 'workplace' | 'receipt' = 'workplace'): Promise<string> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const id = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const photoRecord: WorkPhoto = {
      id,
      ownerId,
      imageData,
      caption,
      uploadedAt: new Date().toISOString(),
      photoType,
    };

    const request = store.put(photoRecord);

    request.onsuccess = () => {
      resolve(id);
    };

    request.onerror = () => {
      reject(new Error('Failed to save photo to IndexedDB.'));
    };
  });
}

export async function getPhoto(id: string): Promise<WorkPhoto | null> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error(`Failed to retrieve photo with id: ${id}`));
    };
  });
}

export async function getPhotosByOwner(ownerId: string): Promise<WorkPhoto[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('ownerId');
    const request = index.getAll(ownerId);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error(`Failed to retrieve photos for owner: ${ownerId}`));
    };
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete photo: ${id}`));
    };
  });
}
