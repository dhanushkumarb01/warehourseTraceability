/**
 * Storage Service
 *
 * Abstracts file storage operations. Currently uses local filesystem,
 * but designed to be easily swappable with AWS S3, Azure Blob, etc.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const env = require('../config/env');

const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

const STORAGE_ROOT = path.join(__dirname, '../../storage');

// Ensure directories exist synchronously on startup. Hosts with ephemeral
// disks (e.g. Render free tier) start with no storage/ folder at all.
for (const dir of [env.VIDEO_UPLOAD_DIR, env.STREAM_HLS_DIR, env.SURVEILLANCE_SNAPSHOT_DIR]) {
  fs.mkdirSync(path.join(STORAGE_ROOT, dir), { recursive: true });
}

/**
 * Save a buffer to the specified directory
 * @param {string} filename 
 * @param {Buffer} buffer 
 * @param {string} directory 
 * @returns {Promise<string>} - The relative file path/reference
 */
const saveFile = async (filename, buffer, directory = 'qrcodes') => {
  const targetDir = path.join(STORAGE_ROOT, directory);
  
  if (!fs.existsSync(targetDir)) {
    await mkdirAsync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, filename);
  await writeFileAsync(filePath, buffer);
  
  // Return a relative path or key that can be used to retrieve it later
  return `${directory}/${filename}`;
};

/**
 * Get the absolute file path from a storage reference
 * @param {string} fileRef 
 * @returns {string}
 */
const getFilePath = (fileRef) => {
  return path.join(STORAGE_ROOT, fileRef);
};

/**
 * Delete a file by reference
 * @param {string} fileRef 
 * @returns {Promise<void>}
 */
const deleteFile = async (fileRef) => {
  const filePath = getFilePath(fileRef);
  if (fs.existsSync(filePath)) {
    await unlinkAsync(filePath);
  }
};

module.exports = {
  saveFile,
  getFilePath,
  deleteFile,
};
