const fs = require('fs').promises;
const config = require('./config');
const decompress = require("decompress");
const {insertDataToGoogleSheets} = require("./insertDataGoogleSheets");
const {cleanUpGoogleToken} = require("./insertDataGoogleSheets.js");

const clenUpBackUpFiles = async () => {
  const filesInProject = await fs.readdir(config.pathToProject)
  const zipFileNames = filesInProject.filter(it => it.match('.zip'))
  return Promise.all(zipFileNames.map(file => fs.unlink(`${config.pathToProject}/${file}`)))
}

const extractJsonFromBackUpZip = async () => {
  const filesInProject = await fs.readdir(config.pathToProject)
  const zipFileNames = filesInProject.filter(it => it.match('.zip'))
  if (!zipFileNames.length) {
    throw new Error('OneDay backup was not provided')
  }
  const files = await decompress(`${config.pathToProject}/${zipFileNames[0]}`, config.distFolderName)
  const journalBuffer = files.find(it => it.path === `${config.journalName}.json`);
  const bufferString = journalBuffer.data.toString();
  await fs.rm(config.distFolderName, {recursive: true});

  return JSON.parse(bufferString)
}

const getScoreFromStringsArray = (arr, string) => {
  return Number(arr.find(it => it.match(string))?.split(': ')[1].replace('\\', '')) || null
}


const getStatsFromDiaryRecord = (string) => {
  const arr = string.split('\n')
  return {
    comfort: getScoreFromStringsArray(arr, 'Психологічний комфорт'),
    sleep: getScoreFromStringsArray(arr, 'сну'),
    health: getScoreFromStringsArray(arr, 'Здоровʼя'),
  }
}

const formatDate = (date, zone) => new Date(date)
  .toLocaleString('en-GB', {timeZone: zone?.includes('/') ? zone : undefined})
  .split(',')[0]

const getAllDaysInRange = function (start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const daysCount = Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1;

  return new Array(daysCount).fill(0).map((_, index) => {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + index);
    return currentDate;
  });
};

const extractAndFormatDataFromJournal = (data) => {
  return data.entries
    .filter(entry => entry.tags && entry.tags.includes('evaluation'))
    .map(entry => {
        const date = formatDate(entry.creationDate, entry.timeZone)
        if (date === "Invalid Date") {
          throw new Error('Error with date formatting')
        }
        return ({
          date,
          ...getStatsFromDiaryRecord(entry.text)
        })
      }
    )
}

const extractDateFromString = (date) => new Date(date.split('/').reverse().join('-'))

const exportDayOneToGoogleSheets = async () => {
  const journalObject = await extractJsonFromBackUpZip()
  const dataToInsert = extractAndFormatDataFromJournal(journalObject)
  const from = extractDateFromString(dataToInsert[0].date)
  const to = extractDateFromString(dataToInsert[dataToInsert.length - 1].date)
  const range = getAllDaysInRange(from, to)
  
  const dataToInsertGapLess = range.map(it => formatDate(it)).map(date => {
    return dataToInsert.find(en => en.date === date) || {date}
  })
  try {
    await insertDataToGoogleSheets(dataToInsertGapLess)
  } catch (e) {
    await cleanUpGoogleToken()
    await insertDataToGoogleSheets(dataToInsertGapLess)
  }

  await clenUpBackUpFiles()
}

exportDayOneToGoogleSheets()
  .catch(console.log)