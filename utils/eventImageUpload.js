
import { Readable } from "stream";
import cloudinary from "../config/cloudinary.js";

export const uploadEventImage = async file => {
  if (!file?.buffer) return "";

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ano-g/events",
        resource_type: "image"
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    Readable.from(file.buffer).pipe(uploadStream);
  });

  return result.secure_url;
};
