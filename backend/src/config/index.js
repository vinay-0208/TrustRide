import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

export const config = {
    server: {
        port: process.env.PORT || 8000,
        nodeEnv: process.env.NODE_ENV || 'development',
        mainUrl: process.env.EXPO_PUBLIC_MAIN_URL || process.env.MAIN_URL || 'http://localhost:8000',
        clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim())
    }
};
