import { fstat, existsSync } from "fs";
import { convert, convertFile } from "./converter";

const file = process.argv[2];

if (existsSync(file)) {
    console.log(`Processing "${file}"...`)
    convertFile(file);
}
else {
    console.error(`"${file}" not found!`)
}
