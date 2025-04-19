// js/employment_barchart.js
// This file will contain the D3.js code for the 
// filterable horizontal bar chart showing total employment by state,
// based on selected NAICS industries affected by tariffs.

document.addEventListener('DOMContentLoaded', function() {
    console.log("Employment barchart script loaded.");

    let allData = [];
    let naicsOptions = [];
    let selectedNaics = new Set(); // Use a Set for efficient lookup
    let totalUniqueNaicsCodes = 0; // Declare in outer scope

    const filtersDiv = d3.select("#employment-filters");
    const chartDiv = d3.select("#employment-barchart");

    // Load the CSV data
    d3.csv('data/oes_chinese_tariffs_naics_state_total_employment.csv').then(function(data) {
        allData = data.map(d => {
            const employment = +d.Total_Employment;
            // Basic validation
            if (isNaN(employment) || !d.State || !d.NAICS_TITLE || !d.NAICS) {
                console.warn("Skipping row due to missing/invalid data:", d);
                return null;
            }
            return {
                state: d.State,
                totalEmployment: employment,
                naicsTitle: d.NAICS_TITLE,
                naics: d.NAICS
            };
        }).filter(d => d !== null);

        // Extract unique NAICS options, grouping NAICS codes by Title
        const naicsTitleMap = new Map();
        allData.forEach(d => {
            if (!naicsTitleMap.has(d.naicsTitle)) {
                naicsTitleMap.set(d.naicsTitle, new Set());
            }
            naicsTitleMap.get(d.naicsTitle).add(d.naics);
        });
        // Convert map to array of objects for easier use
        naicsOptions = Array.from(naicsTitleMap, ([title, codes]) => ({ 
            naicsTitle: title, 
            naicsCodes: codes // Store the Set of NAICS codes
        }));
        // Sort options alphabetically by title
        naicsOptions.sort((a, b) => a.naicsTitle.localeCompare(b.naicsTitle));
        
        // Initialize with all NAICS codes selected
        naicsOptions.forEach(opt => {
            opt.naicsCodes.forEach(code => selectedNaics.add(code));
        });
        totalUniqueNaicsCodes = selectedNaics.size; // Assign value to outer scope variable

        console.log("NAICS Options (Grouped):", naicsOptions);
        console.log("Initial Data Loaded:", allData.length, "rows");

        // Create Filters and Initial Chart
        createFilters();
        updateChart(); // Initial chart with all data

    }).catch(function(error) {
        console.error('Error loading OES CSV data:', error);
        chartDiv.text("Error loading data."); // Display error to user
    });

    function createFilters() {
        filtersDiv.html(""); // Clear previous filters

        // Add container for filter options
        const filterOptionsContainer = filtersDiv.append("div")
            .attr("class", "naics-checkbox-container") // Keep class for now, maybe rename later
            .style("margin-top", "10px")

        // Add clickable filter options (styled divs)
        filterOptionsContainer.selectAll("div.filter-option")
            .data(naicsOptions)
            .enter()
            .append("div")
            .attr("class", "filter-option active") // Start active
            .attr("data-naics", d => d.naicsCodes.values().next().value) // Store FIRST NAICS code for ID maybe?
            .text(d => d.naicsTitle)
            .on("click", function(event, d) {
                // Check if ALL associated codes are currently selected
                let allCodesSelected = true;
                d.naicsCodes.forEach(code => {
                    if (!selectedNaics.has(code)) {
                        allCodesSelected = false;
                    }
                });

                // If all codes for this title were selected, deselect them all.
                // Otherwise, select them all.
                if (allCodesSelected) {
                    d.naicsCodes.forEach(code => selectedNaics.delete(code));
                } else { 
                    d.naicsCodes.forEach(code => selectedNaics.add(code));
                }
                // Toggle active class based on the new state
                d3.select(this).classed('active', !allCodesSelected);

                // Update Select All button text
                selectAllButton.text(selectedNaics.size === totalUniqueNaicsCodes ? "Deselect All" : "Select All");
                updateChart(); // Update chart on filter change
            });

        // Add Select/Deselect All button AFTER the options
        const selectAllButton = filtersDiv.append("button")
            .attr("id", "select-all-naics")
            .attr("class", "filter-button") // Add class for styling
            .text("Deselect All")
            .style("margin-top", "15px") // Add margin above button
            .on("click", function() {
                // Check if ALL possible NAICS codes are currently selected
                const allCurrentlySelected = selectedNaics.size === totalUniqueNaicsCodes;

                if (allCurrentlySelected) {
                    selectedNaics.clear();
                    d3.select(this).text("Select All");
                } else {
                    naicsOptions.forEach(opt => {
                        opt.naicsCodes.forEach(code => selectedNaics.add(code));
                    });
                    d3.select(this).text("Deselect All");
                }
                // Update filter element styles and chart
                filtersDiv.selectAll('.filter-option').classed('active', !allCurrentlySelected);
                updateChart();
            });
    }

    // Chart dimensions and setup
    const chartMargin = { top: 20, right: 30, bottom: 60, left: 150 }; // Increased left margin for state names; Increased bottom margin
    let chartWidth, chartHeight;
    let chartSvg;

    function setupChartDimensions() {
        const containerWidth = chartDiv.node().clientWidth;
        chartWidth = containerWidth - chartMargin.left - chartMargin.right;

        // Safety check for chart width
        if (chartWidth <= 0) {
            console.error("Calculated chart width is not positive. Aborting chart render.", {containerWidth, chartMargin});
            chartDiv.select("svg").remove(); // Ensure no old SVG remains
            chartDiv.html("<p style='color: red;'>Error: Cannot render chart in available space.</p>");
            return false; // Indicate failure
        }

        // Height will depend on the number of bars, calculate dynamically later
        // For now, set a reasonable initial/max height for the SVG container
        chartDiv.style("height", "600px"); // Set container height 
        chartHeight = 600 - chartMargin.top - chartMargin.bottom;

        // Clear previous chart and append SVG
        chartDiv.select("svg").remove();
        chartSvg = chartDiv.append("svg")
            .attr("width", chartWidth + chartMargin.left + chartMargin.right)
            .attr("height", chartHeight + chartMargin.top + chartMargin.bottom)
            .append("g")
            .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

        return true; // Indicate success
    }

    function updateChart() {
        // Setup/Reset Chart Area - exit if dimensions are invalid
        if (!setupChartDimensions()) return; 
        
        // Filter data based on selected NAICS codes
        const filteredData = allData.filter(d => selectedNaics.has(d.naics)); // Filter checks individual NAICS code
        
        // Aggregate data: Group by State and sum Total_Employment
        const aggregatedDataMap = d3.rollup(filteredData, 
                                            v => d3.sum(v, d => d.totalEmployment),
                                            d => d.state);
        
        // Convert map to array and sort
        let aggregatedData = Array.from(aggregatedDataMap, ([state, totalEmployment]) => ({ state, totalEmployment }));
        aggregatedData.sort((a, b) => b.totalEmployment - a.totalEmployment); // Sort descending

        // Limit to top 20 states
        aggregatedData = aggregatedData.slice(0, 20);

        // --- Scales ---
        // X Scale (Linear for Employment)
        const xMax = d3.max(aggregatedData, d => d.totalEmployment);
        const x = d3.scaleLinear()
            .domain([0, xMax])
            .range([0, chartWidth]);

        // Y Scale (Band for States)
        const y = d3.scaleBand()
            .domain(aggregatedData.map(d => d.state)) // Use sorted state names
            .range([0, chartHeight])
            .padding(0.1);
            
        // --- Axes ---
        // Add Y axis
        const yAxisGroup = chartSvg.append("g")
            .attr("class", "y-axis") // Add class for styling
            .call(d3.axisLeft(y));

        // Style Y axis ticks
        yAxisGroup.selectAll("text")
            .style("font-size", "12px") // Adjust size as needed
            .style("fill", "#666")
            .style("font-family", "'JetBrains Mono', monospace");

        // Add vertical grid lines based on x-axis ticks
        const xGrid = d3.axisBottom(x)
            .ticks(5) // Aim for ~4 lines, D3 will choose nice values
            .tickSize(-chartHeight) // Lines span the chart height
            .tickFormat(d3.format(",.0f")); // Format numbers nicely, SHOW labels

        const xGridGroup = chartSvg.append("g") // Store reference to grid group
            .attr("class", "grid x-grid")
            .attr("transform", `translate(0,${chartHeight})`)
            .call(xGrid)
            .call(g => g.select(".domain").remove()); // Remove axis line

        // Style X grid axis tick labels 
        xGridGroup.selectAll("text")
            .style("font-size", "12px") 
            .style("fill", "#666")
            .style("font-family", "'JetBrains Mono', monospace");

        // Style grid lines
        chartSvg.selectAll(".grid line")
            .style("stroke", "#e0e0e0") 
            .style("stroke-dasharray", "2,2");

        // --- Axis Labels ---
        // Add X axis label
        chartSvg.append("text")
            .attr("class", "x-axis-label")
            .attr("text-anchor", "middle")
            .attr("x", chartWidth / 2)
            .attr("y", chartHeight + chartMargin.bottom - 10) // Adjust position relative to new bottom margin
            .style("font-size", "14px") 
            .style("fill", "#666")
            .style("font-family", "'JetBrains Mono', monospace")
            .text("Total Employment (Affected Industries)");

        // --- Bars --- 
        chartSvg.selectAll(".bar")
            .data(aggregatedData, d => d.state) // Use state as key
            .join(
                enter => enter.append("rect")
                            .attr("class", "bar")
                            .attr("y", d => y(d.state))
                            .attr("height", y.bandwidth())
                            .style("fill", "#69b3a2")
                            .attr("x", 0) // Start at 0
                            .attr("width", 0) // Initial width 0 for transition
                            .transition()
                            .duration(500)
                            .attr("width", d => x(d.totalEmployment)), // Transition width
                update => update
                            .transition()
                            .duration(500)
                            .attr("y", d => y(d.state)) // Update position if sort order changed
                            .attr("width", d => x(d.totalEmployment))
                            .attr("height", y.bandwidth()),
                exit => exit.transition().duration(500).attr("width", 0).remove() // Transition out
            );
            
        // TODO: Add tooltips to bars if desired
    }

}); 