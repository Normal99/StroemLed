let metadata = null;
let currentTable = "14092";
let chartInstance = null;

function formatTime(ssbTime) {

    const timeUnit = metadata?.extension?.px?.timeUnit;

    if (timeUnit === "Monthly") {
        const year = ssbTime.substring(0, 4);
        const month = ssbTime.substring(5);

        const months = [
            "Jan","Feb","Mar","Apr","May","Jun",
            "Jul","Aug","Sep","Oct","Nov","Dec"
        ];

        return months[parseInt(month) - 1] + " " + year;
    }

    if (timeUnit === "Quarterly") {
        const year = ssbTime.substring(0, 4);
        const quarter = ssbTime.substring(5);
        return "Q" + quarter + " " + year;
    }

    if (timeUnit === "Yearly") {
        return ssbTime;
    }

    return ssbTime;
}

async function loadMetadata(tableId) {
    const res = await fetch(`https://data.ssb.no/api/pxwebapi/v2/tables/${tableId}/metadata`);
    metadata = await res.json();
    buildDynamicUI();
}

function buildDynamicUI() {

    const container = document.getElementById("dynamicSelectors");
    container.innerHTML = "";

    const dims = metadata.dimension;
    const mode = document.getElementById("compareToggle").value;

    for (let dimName in dims) {

        if (dimName === "Tid") continue;

        const dim = dims[dimName];

        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";

        const label = document.createElement("label");
        label.textContent = dim.label;

        const select = document.createElement("select");
        select.id = dimName;

        if (mode === "compare") {
            select.multiple = true;
            select.size = 4;
        }

        const labels = dim.category.label;

        for (let code in labels) {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = labels[code];
            select.appendChild(option);
        }

        select.selectedIndex = 0;

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        container.appendChild(wrapper);
    }
}

function getSelectedValues(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return [];

    if (select.multiple) {
        return Array.from(select.selectedOptions).map(o => o.value);
    }

    return [select.value];
}

async function fetchSSB() {

    const dims = metadata.dimension;
    const mode = document.getElementById("compareToggle").value;

    const contents =
        document.getElementById("ContentsCode")?.value ||
        Object.keys(dims.ContentsCode.category.index)[0];

    let compareDim = null;

    if (mode === "compare") {
        compareDim = Object.keys(dims).find(dim => {
            const el = document.getElementById(dim);
            return el && el.multiple;
        });
    }

    let selectedValues;

    if (compareDim) {
        selectedValues = getSelectedValues(compareDim);
    } else {
        selectedValues = [getSelectedValues("ContentsCode")[0]];
    }

    let datasets = [];
    let labels = null;

    for (let selected of selectedValues) {

        let url = `https://data.ssb.no/api/pxwebapi/v2/tables/${currentTable}/data?lang=no`;
        url += "&valueCodes[Tid]=top(12)";
        url += `&valueCodes[ContentsCode]=${contents}`;

        for (let dimName in dims) {

            if (dimName === "Tid" || dimName === "ContentsCode") continue;

            let value;

            if (dimName === compareDim) {
                value = selected;
            } else {
                value = document.getElementById(dimName)?.value;
            }

            if (!value) continue;

            url += `&valueCodes[${dimName}]=${value}`;
        }

        const res = await fetch(url);
        const json = await res.json();

        if (res.status !== 200) {
            console.error("API ERROR:", json);
            continue;
        }

        const rawLabels = Object.values(json.dimension.Tid.category.label);
        const values = json.value;

        if (!labels) {
            labels = rawLabels.map(formatTime).reverse();
        }

        let parts = [];

        for (let dimName in dims) {

            if (dimName === "Tid") continue;

            let value;

            if (dimName === compareDim) {
                value = selected;
            } else {
                value = document.getElementById(dimName)?.value;
            }

            if (!value) continue;

            const label =
                metadata.dimension[dimName]?.category?.label?.[value];

            if (label) {
                parts.push(label.split("(")[0].trim());
            }
        }

        let labelName = parts.join(" - ");

        datasets.push({
            label: labelName,
            data: values.reverse(),
            borderWidth: 2
        });
    }

    return { labels, datasets };
}

function createChart(labels, datasets) {

    const container = document.getElementById("chartsContainer");
    container.innerHTML = "";

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true
        }
    });
}
async function handleFetch() {

    if (!metadata) return;

    const result = await fetchSSB();
    if (!result || !result.labels) return;

    createChart(result.labels, result.datasets);
}
document.getElementById("tableSelect").onchange = async function () {
    currentTable = this.value;
    await loadMetadata(currentTable);
};

document.getElementById("compareToggle").onchange = () => {
    buildDynamicUI();
};

async function init() {
    await loadMetadata(currentTable);
}

init();