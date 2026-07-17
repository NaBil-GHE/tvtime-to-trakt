import fs from "fs";
import csv from "csv-parser";
import trakt from "./trakt.js";

const rows = [];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

fs.createReadStream("tv-time-export.csv")
    .pipe(csv())
    .on("data", row => rows.push(row))
    .on("end", async () => {

        console.log(`Loaded ${rows.length} rows`);

        for (const row of rows) {

            if (row.type !== "watch")
                continue;

            try {

                const search = await trakt.get("/search", {
                    params: {
                        query: row.title,
                        type: "show"
                    }
                });

                if (!search.data.length) {
                    console.log(`Not found: ${row.title}`);
                    continue;
                }

                const show = search.data[0].show;

                const payload = {
                    shows: [
                        {
                            ids: {
                                trakt: show.ids.trakt
                            },
                            seasons: [
                                {
                                    number: Number(row.season),
                                    episodes: [
                                        {
                                            number: Number(row.episode),
                                            watched_at: row.watched_at
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                };

                await trakt.post("/sync/history", payload);

                console.log(
                    `✓ ${row.title} S${row.season}E${row.episode}`
                );

            } catch (e) {

                console.log(
                    `✗ ${row.title}`,
                    e.response?.data || e.message
                );

            }

            await sleep(350);

        }

        console.log("Done.");
    });