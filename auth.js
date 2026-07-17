import express from "express";
import axios from "axios";
import open from "open";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = 3000;

const {
    TRAKT_CLIENT_ID,
    TRAKT_CLIENT_SECRET
} = process.env;

app.get("/callback", async (req, res) => {
    const code = req.query.code;

    try {
        const { data } = await axios.post(
            "https://api.trakt.tv/oauth/token",
            {
                code,
                client_id: TRAKT_CLIENT_ID,
                client_secret: TRAKT_CLIENT_SECRET,
                redirect_uri: "http://localhost:3000/callback",
                grant_type: "authorization_code"
            }
        );

        console.log("\n========================");
        console.log("ACCESS TOKEN");
        console.log(data.access_token);
        console.log("========================\n");

        res.send("Success! يمكنك إغلاق الصفحة.");
        process.exit(0);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.send("Authentication failed");
    }
});

app.listen(PORT, () => {

    const url =
        `https://trakt.tv/oauth/authorize?response_type=code` +
        `&client_id=${TRAKT_CLIENT_ID}` +
        `&redirect_uri=http://localhost:3000/callback`;

    console.log("Opening browser...");
    open(url);
});