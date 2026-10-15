
import multer from "multer";

const storage = multer.memoryStorage();

const uploadProfile = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error(
        "Only JPG, PNG, and WebP images are allowed."
      );
      error.status = 400;
      return callback(error);
    }

    callback(null, true);
  }
});

export const uploadProfilePicture = (req, res, next) => {
  uploadProfile.single("profilePicture")(req, res, error => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Profile picture must not exceed 2 MB."
            : error.message || "Unable to upload image."
      });
    }

    next();
  });
};

export default uploadProfile;
