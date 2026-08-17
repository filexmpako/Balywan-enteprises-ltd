import React, { useEffect, useState } from 'react';
import { getPhoto } from '../utils/db';
import { getAvatarUrl } from '../utils/avatar';

interface OwnerAvatarProps {
  ownerName: string;
  avatarPhotoId?: string;
  className?: string;
  alt?: string;
}

export default function OwnerAvatar({ ownerName, avatarPhotoId, className, alt }: OwnerAvatarProps) {
  const [imgSrc, setImgSrc] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (avatarPhotoId) {
      getPhoto(avatarPhotoId)
        .then((photo) => {
          if (active) {
            if (photo && photo.imageData) {
              setImgSrc(photo.imageData);
            } else {
              setImgSrc(getAvatarUrl(ownerName));
            }
          }
        })
        .catch(() => {
          if (active) setImgSrc(getAvatarUrl(ownerName));
        });
    } else {
      setImgSrc(getAvatarUrl(ownerName));
    }
    return () => {
      active = false;
    };
  }, [ownerName, avatarPhotoId]);

  return (
    <img 
      src={imgSrc || getAvatarUrl(ownerName)} 
      alt={alt || ownerName} 
      className={className}
      referrerPolicy="no-referrer"
    />
  );
}
