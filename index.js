import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { pipeline } from "node:stream";

import fetch from "node-fetch";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import xml2js from "xml2js";

const streamPipeline = util.promisify(pipeline);

const CBR_URL = "http://www.cbr.ru/s/newbik";

async function getBikFromCbr() {
  // Retrieve data from the CBR_URL
  const res = await fetch(CBR_URL);
  if (!res.ok) {
    throw Error(`Failed to retrieve ${CBR_URL} with code ${res.status}.`);
  }

  // Write temporary file
  const tmp_dir = "."; //os.tmpdir();
  const tmp_file_name = res.headers
    .get("content-disposition")
    .split(";")[1]
    .split("=")[1];
  const tmp_file_path = path.join(tmp_dir, tmp_file_name);
  const saveArchive = new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmp_file_path);
    res.body.pipe(file);
    res.body.on("finish", () => {
      file.close();
      resolve();
    });
    res.body.on("error", reject);
  });
  return saveArchive;

  // await streamPipeline(res.body, fs.createWriteStream(tmp_file_path));

  // Unpack data
  const archive = new AdmZip(tmp_file_path);
  const xml_file_name = archive.getEntries()[0].entryName;
  const xml_file_path = `${tmp_dir}\\${xml_file_name}`;
  archive.extractEntryTo(xml_file_name, tmp_dir, true, true);
  const data = archive.getEntry(xml_file_name).getData();

  // Parse xml
  const decoded = iconv.decode(data, "Windows-1251");
  const jsonData = await xml2js.parseStringPromise(decoded).then((data) => {
    // Clear tmp files
    fs.unlinkSync(tmp_file_path);
    fs.unlinkSync(xml_file_path);
    return data;
  });

  return jsonData.ED807.BICDirectoryEntry.map((entry) => {
    return {
      id: entry.$.BIC,
      name: entry.ParticipantInfo && entry.ParticipantInfo[0].$.NameP,
      corrAccount: entry.Accounts && entry.Accounts[0].$.Account,
    };
  });
}

getBikFromCbr().then((data) => {
  console.log("done");
});
