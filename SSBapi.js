async function getElectricityData() {
    const url = "https://data.ssb.no/api/pxwebapi/v2/tables/08655/data";

    const query = {
        "query": [
            "code": "Region",
        ]
    }