import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsblast';
  try {
    await mongoose.connect(mongoUri);
    console.log('🍃 Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
}
