// 🌍 GLOBAL METADATA
let metadata;


// 🔧 Convert SSB time → readable format
function formatMonth(ssbTime) {
    const year = ssbTime.substring(0, 4);
    const month = ssbTime.substring(5);

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return months[parseInt(month) - 1] + " " + year;
}


// 🔍 Convert LABEL → CODE (IMPORTANT FUNCTION)
function getCode(variable, labelName) {

    const category = metadata.dimension[variable].category;

    const labels = category.label;

    for (let code in labels) {
        if (labels[code] === labelName) {
            return code;
        }
    }

    console.error("Code not found for:", labelName);
    return null;
}


// 📊 Create chart
function createChart(labels, data, labelName) {

    const ctx = document.getElementById('myChart');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: data,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true
        }
    });
}


// 🌐 Load metadata ONCE
async function loadMetadata() {
    const res = await fetch("https://data.ssb.no/api/pxwebapi/v2/tables/14092/metadata?lang=no");
    metadata = await res.json();

    console.log("Metadata loaded:", metadata);
}


// 📡 Fetch data (DYNAMIC)
async function getData(forbrukerLabel, prisLabel) {

    const forbruker = getCode("Forbrukargruppe", forbrukerLabel);
    const pris = getCode("Prisomraade", prisLabel);

    // Get first (and only) contents code automatically
    const contents = Object.keys(metadata.dimension.ContentsCode.category.index)[0];

    const url = "https://data.ssb.no/api/pxwebapi/v2/tables/14092/data?lang=no" +
        "&valueCodes[Tid]=top(12)" +
        `&valueCodes[Forbrukargruppe]=${forbruker}` +
        `&valueCodes[Prisomraade]=${pris}` +
        `&valueCodes[ContentsCode]=${contents}`;

    const response = await fetch(url);
    const json = await response.json();

    if (response.status !== 200) {
        console.error("API ERROR:", json);
        return;
    }

    console.log("DATA:", json);

    // 🧹 Extract data
    const rawLabels = Object.values(json.dimension.Tid.category.label);
    const values = json.value;

    // 🎨 Format labels
    const timeLabels = rawLabels.map(formatMonth);

    // 🔄 Fix order
    timeLabels.reverse();
    values.reverse();

    // 📊 Draw graph
    createChart(timeLabels, values, `${forbrukerLabel} - ${prisLabel}`);
}


// 🚀 INIT (IMPORTANT ORDER)
async function init() {
    await loadMetadata();

    // Example graph
    getData("Husholdninger", "NO1");
}

init();