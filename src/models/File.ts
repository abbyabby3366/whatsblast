import mongoose, { Schema, Document } from 'mongoose';

export enum FileType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  STICKER = 'sticker',
}

export interface IFile extends Document {
  user?: mongoose.Types.ObjectId;
  file_type: FileType;
  file_path: string;
  file_name?: string;
  file_size?: number;
  mimetype?: string;
  caption?: string;
  ptt?: boolean;
  gif?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<IFile>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    file_type: { type: String, enum: Object.values(FileType), required: true },
    file_path: { type: String, required: true },
    file_name: { type: String },
    file_size: { type: Number },
    mimetype: { type: String },
    caption: { type: String },
    ptt: { type: Boolean, default: false },
    gif: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const FileModel = mongoose.model<IFile>('File', FileSchema);
