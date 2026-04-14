// INTENTIONALLY VULNERABLE — FOR CYBERSECURITY LAB USE ONLY

const express = require('express');
const helmet = require('helmet'); // Import helmet module
const { exec } = require('child_process');
const cors = require('cors');
const app = express();
const path = require('path'); // Import path module
const port = process.env.PORT || 3000;

// Configure CORS to allow your Vercel frontend
const corsOptions = {
    origin: ['https://dumdum-roan.vercel.app'], // Allow Vercel frontend
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Configure helmet security headers
app.use(helmet());
// Optionally, enable these specific security headers
// app.use(helmet.contentSecurityPolicy({
//   directives: {
//     defaultSrc: [