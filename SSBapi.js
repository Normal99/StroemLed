let metadata = null;

// 🔧 Format month
function formatMonth(ssbTime) {
    const year = ssbTime.substring(0, 4);
    const month = ssbTime.substring(5);

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return months[parseInt(month) - 1] + " " + year;
}

// 🌐 Load metadata
async function loadMetadata() {
    const res = await fetch("https://data.ssb.no/api/pxwebapi/v2/tables/14092/metadata");
    metadata = await res.json();

    console.log("Metadata loaded:", metadata);
}

// 🔍 Get code from label
function getCode(dimension, userValue) {
    const category = metadata.dimension[dimension].category;

    if (category.index[userValue] !== undefined) {
        return userValue;
    }

    const labels = category.label;

    for (let code in labels) {
        if (labels[code].toLowerCase() === userValue.toLowerCase()) {
            return code;
        }
    }

    console.error("Code not found:", userValue);
    return null;
}

// 🎛️ Populate dropdowns
function populateDropdowns() {

    const forbrukerSelect = document.getElementById("forbrukerSelect");
    const prisSelect = document.getElementById("prisSelect");
    const prisCompareSelect = document.getElementById("prisCompareSelect");

    const forbrukerData = metadata.dimension.Forbrukargruppe.category.label;
    const prisData = metadata.dimension.Prisomraade.category.label;

    forbrukerSelect.innerHTML = "";
    prisSelect.innerHTML = "";
    prisCompareSelect.innerHTML = "";

    // Consumer
    for (let code in forbrukerData) {
        const option = document.createElement("option");
        option.value = forbrukerData[code];
        option.textContent = forbrukerData[code];
        forbrukerSelect.appendChild(option);
    }

    // Regions
    for (let code in prisData) {
        const option1 = document.createElement("option");
        option1.value = prisData[code];
        option1.textContent = prisData[code];

        const option2 = option1.cloneNode(true);

        prisSelect.appendChild(option1);
        prisCompareSelect.appendChild(option2);
    }
}

// 🔄 Mode switch
document.getElementById("modeSelect").onchange = function () {
    const mode = this.value;

    if (mode === "single") {
        document.getElementById("prisSelect").style.display = "block";
        document.getElementById("prisCompareSelect").style.display = "none";
    } else {
        document.getElementById("prisSelect").style.display = "none";
        document.getElementById("prisCompareSelect").style.display = "block";
    }
};

// 🧱 Create canvas
function createChartContainer() {
    const container = document.getElementById("chartsContainer");

    container.innerHTML = ""; // clear old

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);

    return canvas;
}

// 📊 Create chart
function createChart(canvas, labels, datasets) {
    const ctx = canvas.getContext("2d");

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true
        }
    });
}

// 🚀 Main logic
async function handleCompare() {

    const mode = document.getElementById("modeSelect").value;

    const forbrukerLabel = document.getElementById("forbrukerSelect").value;
    const forbrukerCode = getCode("Forbrukargruppe", forbrukerLabel);

    const contents = Object.keys(metadata.dimension.ContentsCode.category.index)[0];

    let datasets = [];
    let labels = null;

    // 🟢 SINGLE
    if (mode === "single") {

        const prisLabel = document.getElementById("prisSelect").value;
        const prisCode = getCode("Prisomraade", prisLabel);

        const url = "https://data.ssb.no/api/pxwebapi/v2/tables/14092/data?lang=no" +
            "&valueCodes[Tid]=top(12)" +
            `&valueCodes[Forbrukargruppe]=${forbrukerCode}` +
            `&valueCodes[Prisomraade]=${prisCode}` +
            `&valueCodes[ContentsCode]=${contents}`;

        const res = await fetch(url);
        const json = await res.json();

        const rawLabels = Object.values(json.dimension.Tid.category.label);
        const values = json.value;

        const timeLabels = rawLabels.map(formatMonth);

        timeLabels.reverse();
        values.reverse();

        datasets.push({
            label: prisLabel,
            data: values,
            borderWidth: 2
        });

        labels = timeLabels;
    }

    // 🔵 COMPARE
    if (mode === "compare") {

        const selectedPris = Array.from(
            document.getElementById("prisCompareSelect").selectedOptions
        ).map(o => o.value);

        for (let prisLabel of selectedPris) {

            const prisCode = getCode("Prisomraade", prisLabel);

            const url = "https://data.ssb.no/api/pxwebapi/v2/tables/14092/data?lang=no" +
                "&valueCodes[Tid]=top(12)" +
                `&valueCodes[Forbrukargruppe]=${forbrukerCode}` +
                `&valueCodes[Prisomraade]=${prisCode}` +
                `&valueCodes[ContentsCode]=${contents}`;

            const res = await fetch(url);
            const json = await res.json();

            const rawLabels = Object.values(json.dimension.Tid.category.label);
            const values = json.value;

            const timeLabels = rawLabels.map(formatMonth);

            timeLabels.reverse();
            values.reverse();

            if (!labels) labels = timeLabels;

            datasets.push({
                label: prisLabel,
                data: values,
                borderWidth: 2
            });
        }
    }

    const canvas = createChartContainer();
    createChart(canvas, labels, datasets);
}

// 🟢 Init
async function init() {
    await loadMetadata();
    populateDropdowns();
}

init();