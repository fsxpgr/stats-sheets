const fs = require('fs').promises;
const config = require('./config');
const decompress = require("decompress");
const {insertDataToGoogleSheets} = require("./insertDataGoogleSheets");

const clenUpBackUpFiles = async () => {
  const filesInProject = await fs.readdir(config.pathToProject)
  const zipFileNames = filesInProject.filter(it => it.match('.zip'))
  return Promise.all(zipFileNames.map(file => fs.unlink(`${config.pathToProject}/${file}`)))
}

const extractJsonFromBackUpZip = async () => {
  const filesInProject = await fs.readdir(config.pathToProject)
  const zipFileNames = filesInProject.filter(it => it.match('.zip'))

  const files = await decompress(`${config.pathToProject}/${zipFileNames[0]}`, config.distFolderName)
  const journalBuffer = files.find(it => it.path === `${config.journalName}.json`);
  const bufferString = journalBuffer.data.toString();
  await fs.rmdir(config.distFolderName, {recursive: true});

  return JSON.parse(bufferString)
}

const stringParser = (string) => {
  const arr = string.split('\n')
  return {
    comfort: Number(arr.find(it => it.match('Психологічний комфорт'))?.split(': ')[1].replace('\\', '')) || null,
    sleep: Number(arr.find(it => it.match('сну'))?.split(': ')[1].replace('\\', '')) || null,
    health: Number(arr.find(it => it.match('Здоровʼя'))?.split(': ')[1].replace('\\', '')) || null,
  }
}

const formatDate = (date, zone) => new Date(date)
  .toLocaleString('en-GB', {timeZone: zone})
  .split(',')[0]

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
          ...stringParser(entry.text)
        })
      }
    )
}

const exportDayOneToGoogleSheets = async () => {
  const journalObject = await extractJsonFromBackUpZip()
  const dataToInsert = extractAndFormatDataFromJournal(journalObject)
  await insertDataToGoogleSheets(dataToInsert)
  await clenUpBackUpFiles()
}

exportDayOneToGoogleSheets()
  .catch(console.log)