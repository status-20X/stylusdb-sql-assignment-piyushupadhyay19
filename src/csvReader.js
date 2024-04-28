const fs = require("fs");
const { parse } = require("json2csv");
const csv = require("csv-parser");

async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const data = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        data.push(row);
      })
      .on("end", () => {
        resolve(data);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

async function writeCSV(filename, data) {
  try {
    const csvData = parse(data);
    fs.writeFileSync(filename, csvData);
  } catch (error) {
    throw error;
  }
}

module.exports = { readCSV, writeCSV };
