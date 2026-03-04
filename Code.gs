function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const payload = JSON.parse(e.postData.contents);

    const username = payload.username;
    const gender = payload.gender;
    const petType = payload.petType;
    const statsData = JSON.stringify(payload.statsData);
    const lastUpdated = new Date();

    if (!username) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Username is required"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    let userRowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === username) {
        userRowIndex = i + 1;
        break;
      }
    }

    if (userRowIndex !== -1) {
      sheet.getRange(userRowIndex, 2).setValue(gender);
      sheet.getRange(userRowIndex, 3).setValue(petType);
      sheet.getRange(userRowIndex, 4).setValue(statsData);
      sheet.getRange(userRowIndex, 5).setValue(lastUpdated);
    } else {
      if (values.length === 1 && values[0][0] === "") {
         sheet.appendRow(["Username", "Gender", "PetType", "StatsData", "LastUpdated"]);
      }
      sheet.appendRow([username, gender, petType, statsData, lastUpdated]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Data saved successfully"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Zen Walk API is running");
}
