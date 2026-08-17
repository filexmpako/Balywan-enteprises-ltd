import { getPhotosByOwner, deletePhoto } from './db';
import { resolveOwnerMatch } from './ownerMatch';
import { invalidateClassificationCache } from './classificationCache';

export interface OwnerDeletionImpact {
  ownerId: string;
  ownerName: string;
  tillsUnassigned: number;
  baseWakalasUnassigned: number;
  iopWakalasRemoved: number;
  photosDeleted: number;
  loginAccountDeleted: boolean;
  loginEmail?: string;
}

export async function getOwnerDeletionImpact(ownerId: string): Promise<OwnerDeletionImpact> {
  const owners = JSON.parse(localStorage.getItem('ownersList') || '[]');
  const owner = owners.find((o: any) => o.id === ownerId || o.name?.toLowerCase() === ownerId.toLowerCase());
  if (!owner) throw new Error('Owner not found');

  const actualOwnerId = owner.id;
  const ownerNameLower = (owner.name || '').trim().toLowerCase();

  // 1. Tills
  const tillsList = JSON.parse(localStorage.getItem('tillsList') || '[]');
  let tillsUnassigned = 0;
  tillsList.forEach((t: any) => {
    if (t.assignedOwner && t.assignedOwner.trim().toLowerCase() === ownerNameLower) {
      tillsUnassigned++;
    }
  });

  // 2. Base Wakala Index
  const baseWakalaIndex = JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
  let baseWakalasUnassigned = 0;
  baseWakalaIndex.forEach((w: any) => {
    const match = resolveOwnerMatch(w.ownerName, [owner] as any, 'Owner Deletion Impact');
    if (match.matchedOwner?.id === actualOwnerId) {
      baseWakalasUnassigned++;
    }
  });

  // 3. IOP Wakalas
  const iopWakalasRemoved = (owner.iopWakalas || []).length;

  // 4. Photos
  let photosCount = 0;
  try {
    const photos = await getPhotosByOwner(actualOwnerId);
    photosCount = photos.length;
  } catch (e) {
    console.error('Error fetching photos for deletion impact:', e);
  }
  if (owner.avatarPhotoId) {
    photosCount++;
  }

  // 5. Login account
  const users = JSON.parse(localStorage.getItem('hasidadi_users') || '[]');
  const linkedUser = users.find((u: any) => u.ownerId === actualOwnerId);

  return {
    ownerId: actualOwnerId,
    ownerName: owner.name,
    tillsUnassigned,
    baseWakalasUnassigned,
    iopWakalasRemoved,
    photosDeleted: photosCount,
    loginAccountDeleted: !!linkedUser,
    loginEmail: linkedUser?.email,
  };
}

export async function deleteOwnerCascade(ownerId: string): Promise<{
  tillsUnassigned: number;
  baseWakalasUnassigned: number;
  iopWakalasRemoved: number;
  photosDeleted: number;
  loginAccountDeleted: boolean;
}> {
  // 1. Remove from ownersList
  const owners = JSON.parse(localStorage.getItem('ownersList') || '[]');
  const owner = owners.find((o: any) => o.id === ownerId || o.name?.toLowerCase() === ownerId.toLowerCase());
  if (!owner) throw new Error('Owner not found');

  const actualOwnerId = owner.id;
  const ownerNameLower = (owner.name || '').trim().toLowerCase();

  const updatedOwners = owners.filter((o: any) => o.id !== actualOwnerId);
  localStorage.setItem('ownersList', JSON.stringify(updatedOwners));

  // 2. Unassign (not delete) any tills pointing at this owner
  const tillsList = JSON.parse(localStorage.getItem('tillsList') || '[]');
  let tillsUnassigned = 0;
  const updatedTills = tillsList.map((t: any) => {
    if (t.assignedOwner && t.assignedOwner.trim().toLowerCase() === ownerNameLower) {
      tillsUnassigned++;
      return { ...t, assignedOwner: '' };
    }
    return t;
  });
  localStorage.setItem('tillsList', JSON.stringify(updatedTills));

  // 3. Unassign (not delete) baseWakalaIndex entries pointing at this owner
  const baseWakalaIndex = JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
  let baseWakalasUnassigned = 0;
  const updatedIndex = baseWakalaIndex.map((w: any) => {
    const match = resolveOwnerMatch(w.ownerName, [owner] as any, 'Owner Deletion Cascade');
    if (match.matchedOwner?.id === actualOwnerId) {
      baseWakalasUnassigned++;
      return { ...w, ownerName: '' };
    }
    return w;
  });
  localStorage.setItem('baseWakalaIndex', JSON.stringify(updatedIndex));

  // 4. owner.iopWakalas is deleted automatically with the owner record itself
  const iopWakalasRemoved = (owner.iopWakalas || []).length;

  // 5. Remove manualOwnerTargets entries for this owner
  const manualTargets = JSON.parse(localStorage.getItem('manualOwnerTargets') || '[]');
  const updatedTargets = manualTargets.filter((t: any) => t.ownerId !== actualOwnerId);
  localStorage.setItem('manualOwnerTargets', JSON.stringify(updatedTargets));

  // 6. Delete IndexedDB photos (avatar + work + any receipts)
  let photosDeleted = 0;
  try {
    const photos = await getPhotosByOwner(actualOwnerId);
    photosDeleted = photos.length;
    for (const photo of photos) {
      await deletePhoto(photo.id);
    }
  } catch (e) {
    console.error('Error deleting photos during owner cascade delete:', e);
  }

  if (owner.avatarPhotoId) {
    try {
      await deletePhoto(owner.avatarPhotoId);
      photosDeleted++;
    } catch (e) {}
  }

  // 7. Remove reportSubmissions_${ownerId} localStorage key
  localStorage.removeItem(`reportSubmissions_${actualOwnerId}`);
  localStorage.removeItem(`reportSubmissions_${owner.name}`);

  // 8. Delete linked login account, if one exists
  const users = JSON.parse(localStorage.getItem('hasidadi_users') || '[]');
  const linkedUser = users.find((u: any) => u.ownerId === actualOwnerId);
  const updatedUsers = users.filter((u: any) => u.ownerId !== actualOwnerId);
  localStorage.setItem('hasidadi_users', JSON.stringify(updatedUsers));

  // 9. Invalidate classification cache, since ownersList changed
  invalidateClassificationCache();

  return {
    tillsUnassigned,
    baseWakalasUnassigned,
    iopWakalasRemoved,
    photosDeleted,
    loginAccountDeleted: !!linkedUser,
  };
}
