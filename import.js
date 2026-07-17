import fs from "fs";
import csv from "csv-parser";

const rows = [];

fs.createReadStream("tv-time-export.csv")
    .pipe(csv())
    .on("data", (row) => {
        rows.push(row);
    })
    .on("end", () => {
        console.log(`Found ${rows.length} rows\n`);

        console.log("Columns:");
        console.log(Object.keys(rows[0]));

        console.log("\nFirst row:");
        console.log(rows[0]);
    });