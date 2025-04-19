// This file will contain the JavaScript code for the tariffs map and scatterplot visualization using D3.js. 

document.addEventListener('DOMContentLoaded', function () {
    // Define margins, width, and height for the main scatter plot
    const scatterMargin = { top: 120, right: 30, bottom: 70, left: 60 };
    const scatterContainer = document.getElementById('tariff-scatterplot-container');
    const mapContainer = document.getElementById('tariff-map-container');

    if (!scatterContainer || !mapContainer) {
        console.error("Required container elements not found!");
        return;
    }

    // Get container dimensions AFTER CSS has potentially set them
    let scatterContainerWidth = scatterContainer.clientWidth;
    let mapContainerWidth = mapContainer.clientWidth;
    let mapContainerHeight = mapContainer.clientHeight; // Use container height for map

    // If widths are zero initially, use a fallback or wait (simple fallback here)
    if (scatterContainerWidth === 0 || mapContainerWidth === 0) {
        console.warn("Container widths are zero, using fallback estimates.");
        // Estimate based on flex properties if needed, assuming parent width
        const parentWidth = scatterContainer.parentElement.clientWidth || 1000; // Fallback parent width
        mapContainerWidth = parentWidth * (1 / 3) - 10; // Account for gap
        scatterContainerWidth = parentWidth * (2 / 3) - 10; // Account for gap
    }
     if (mapContainerHeight === 0) {
        mapContainerHeight = 400; // Default/Fallback map height
     }

    const scatterWidth = scatterContainerWidth - scatterMargin.left - scatterMargin.right;
    const scatterHeight = Math.max(100, 600 - scatterMargin.top - scatterMargin.bottom); // Reduced height to 650, ensure minimum

    // --- SVG Setup ---
    // Scatterplot SVG
    const scatterSvgContainer = d3.select("#tariff-scatterplot-container")
        .append("svg")
        // Use viewBox for responsive scaling
        .attr("viewBox", `0 0 ${scatterWidth + scatterMargin.left + scatterMargin.right} ${scatterHeight + scatterMargin.top + scatterMargin.bottom}`)
        .attr("preserveAspectRatio", "xMidYMid meet"); // Maintain aspect ratio
        
    const scatterSvg = scatterSvgContainer.append("g")
        .attr("transform", `translate(${scatterMargin.left},${scatterMargin.top})`);

    // Map SVG 
    const mapMargin = { top: 10, right: 10, bottom: 10, left: 10 };
    const mapWidth = mapContainerWidth - mapMargin.left - mapMargin.right;
    const mapHeight = mapContainerHeight - mapMargin.top - mapMargin.bottom;

    const mapSvgContainer = d3.select("#tariff-map-container")
        .append("svg")
        // Use viewBox for responsive scaling
        .attr("viewBox", `0 0 ${mapWidth + mapMargin.left + mapMargin.right} ${mapHeight + mapMargin.top + mapMargin.bottom}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const mapSvg = mapSvgContainer.append("g")
        .attr("transform", `translate(${mapMargin.left},${mapMargin.top})`);

    // Create a div for the SCATTERPLOT tooltip (initially hidden, appended to body)
    const scatterTooltip = d3.select("body") 
        .append("div")
        .attr("class", "tooltip") // Keep the tooltip class for styling
        .style("opacity", 0)
        .style("position", "absolute") 
        .style("pointer-events", "none") 
        .style("background-color", "white")
        .style("border", "solid")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "10px")
        .style("min-width", "150px")
        .style("z-index", "10") 
        .style("font-size", "12px");

    // Create a div for the MAP tooltip (initially hidden)
    const mapTooltip = d3.select("body") // Append to body to avoid clipping issues
        .append("div")
        .attr("class", "map-tooltip") // Use a different class 
        .style("opacity", 0)
        .style("background-color", "rgba(0, 0, 0, 0.7)")
        .style("color", "white")
        .style("border-radius", "3px")
        .style("padding", "5px 8px")
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("font-size", "11px");

    // Load BOTH CSV and TopoJSON data
    Promise.all([
        d3.csv('data/tariffs_industries_votes_county.csv'),
        d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json') // Load US states TopoJSON
    ]).then(function([csvData, usMapData]) {
        
        // --- Process CSV Data ---
        const processedData = csvData.map(d => {
            const trumpPct = +d.Trump_Pct;
            const affectedJobsPctRaw = +d.Affected_Jobs_Pct_of_Total_Votes;
            const stateName = d.State; // Keep state name for linking

            if (isNaN(trumpPct) || isNaN(affectedJobsPctRaw) || trumpPct < 0 || trumpPct > 100 || affectedJobsPctRaw < 0 || !stateName) {
                return null;
            }

            let affectedJobsPct;

            // Check for NaN immediately after conversion
            if (isNaN(trumpPct) || isNaN(affectedJobsPctRaw)) {
                // console.warn(`Skipping row due to invalid initial numeric data:`, d);
                return null; 
            }

            // Use the percentage value directly
            affectedJobsPct = affectedJobsPctRaw;

            // Handle zero values for log scale - replace with a small positive value
            const minValueForLog = 0.01; // Represent 0.01%
            if (affectedJobsPct <= 0) {
                affectedJobsPct = minValueForLog;
            }

            // Validation: Check if final values are valid numbers and within reasonable ranges
            if (isNaN(affectedJobsPct) || trumpPct < 0 || trumpPct > 100 /* removed affectedJobsPct < 0 check as it's handled */) { 
                // console.warn(`Skipping row due to invalid or out-of-range final numeric data:`, d);
                return null;
            }

            return {
                county: d.County,
                state: stateName,
                trump_pct: trumpPct,
                affected_jobs_pct: affectedJobsPct,
            };
        }).filter(d => d !== null);

        // --- Create Visualizations ---
        createTariffScatterplot(processedData);
        createTariffMap(usMapData, processedData);

    }).catch(function(error) {
        console.error('Error loading data:', error);
    });

    let scatterPoints; // Variable to hold the scatter points selection
    let stateCountyData; // To store county data grouped by state

    // Function to create the scatterplot
    function createTariffScatterplot(plotData) {
        // Group data by state for easier lookup later
        stateCountyData = d3.group(plotData, d => d.state);
        // console.log("Data grouped by state:", stateCountyData);

        const x = d3.scaleLinear()
            .domain([0, 100])
            .range([0, scatterWidth]);

        // Y scale: Affected Jobs Pct of Total Votes (Log Scale)
        const yMin = 0.01; // Minimum value for log scale (matching zero replacement)
        const yMax = d3.max(plotData, d => d.affected_jobs_pct); 
        const y = d3.scaleLog() // Change to log scale
            .domain([yMin, yMax + (yMax * 0.1)]) // Domain starts from small positive value
            .range([scatterHeight, 0]) // Y scale is inverted for SVG
            .base(10); // Explicitly set base 10

        // --- Tooltip (Now references the one created outside and appended to body) --- 
        // const tooltip = d3.select("#tariff-scatterplot-container .tooltip") // REMOVED selection from here
        //      .style("opacity", 0); 

        // if (tooltip.empty()) { ... } // REMOVED check

        // --- Event Handlers for Tooltip ---
        const mouseover = function(event, d) {
            scatterTooltip.style("opacity", 1); // Use scatterTooltip
            // Don't change radius/stroke on hover if it's part of a selected state
            if (!d3.select(this).classed('selected-state')) {
                d3.select(this).attr("r", 5).style("stroke", "black");
            }
        };

        const mousemove = function(event, d) {
            // const [pointerX, pointerY] = d3.pointer(event, scatterSvg.node().parentNode); // No longer needed
            scatterTooltip // Use scatterTooltip
                .html(`State: ${d.state}<br>County: ${d.county}<br>Trump Vote: ${d.trump_pct.toFixed(1)}%<br>Affected Jobs (% Votes): ${d.affected_jobs_pct.toFixed(2)}%`)
                .style("left", (event.pageX + 15) + "px") // Use pageX for body-relative positioning
                .style("top", (event.pageY - 28) + "px"); // Use pageY for body-relative positioning
        };

        const mouseout = function(event, d) {
             scatterTooltip.style("opacity", 0); // Use scatterTooltip
             // Only reset styles if not currently selected by map click
             if (!d3.select(this).classed('selected-state')) {
                 d3.select(this).attr("r", 3).style("stroke", "none");
             } 
        };

        // --- Axes & Gridlines ---
        // Add X axis
        const xAxisGroup = scatterSvg.append("g") // Store axis group for later styling
           .attr("class", "x-axis") // Add class for styling
           .attr("transform", `translate(0,${scatterHeight})`)
           .call(d3.axisBottom(x).tickFormat(d => `${d}%`)); // Format as percentage

        // Style X axis ticks
        xAxisGroup.selectAll("text")
            .style("font-size", "12px") // Increase font size
            .style("fill", "#666")
            .style("font-family", "'JetBrains Mono', monospace");

        // Add SPECIFIC horizontal grid lines using the log scale
        const yGridValues = [1, 10, 25, 50, 100]; // Specific values required
        const yGrid = d3.axisLeft(y)
            .tickValues(yGridValues)
            .tickSize(-scatterWidth) // Lines across the plot
            .tickFormat(d => `${d}%`); // Format as percentage

        const yGridGroup = scatterSvg.append("g") 
           .attr("class", "grid y-grid")
           .call(yGrid)
           .call(g => g.select(".domain").remove()); // Remove the axis domain line itself
           
        // Style y-axis grid LABELS
        yGridGroup.selectAll(".tick text")
           .style("text-anchor", "end")
           .attr("dx", "-0.5em") 
           .style("font-size", "12px") 
           .style("fill", "#666")
           .style("font-family", "'JetBrains Mono', monospace");

        // Style y-axis grid LINES
        yGridGroup.selectAll(".tick line")
             .style("stroke", "#e0e0e0") 
             .style("stroke-dasharray", "2,2");

        // --- Axis Labels ---
        // X axis label
        scatterSvg.append("text")
           .attr("class", "x-axis-label") // Add class for potential CSS styling
           .attr("text-anchor", "middle") // Center the label
           .attr("x", scatterWidth / 2) // Center horizontally relative to plot width
           .attr("y", scatterHeight + scatterMargin.bottom - 5) // Position below X axis using bottom margin
           .style("font-size", "16px") // Increase font size
           .style("fill", "#666")
           .style("font-family", "'JetBrains Mono', monospace")
           .text("Trump Vote Percentage (2024)");

        // Y axis label - Repositioned and restyled
        scatterSvg.append("text")
           .attr("class", "y-axis-label") // Add class
           .attr("text-anchor", "start") // Left align
           .attr("y", -scatterMargin.top + 30) // Position below top edge within the large margin
           .attr("x", 0) // Align with x=0
           .style("font-size", "16px") // Increase font size
           .style("fill", "#666")
           .style("font-family", "'JetBrains Mono', monospace")
           .text("Affected Jobs (% of Total Votes)");

        // Store the selection of points
        scatterPoints = scatterSvg.append('g')
           .selectAll("dot")
           .data(plotData, d => `${d.state}-${d.county}`) // Add key function
           .enter()
           .append("circle")
             .attr("class", d => `county-dot state-${d.state.toLowerCase().replace(/\s+/g, '-')}`) // Add state class
             .attr("cx", d => x(d.trump_pct))
             // Clamp cy value to prevent points going below the x-axis due to log scale precision
             .attr("cy", d => Math.min(scatterHeight, y(d.affected_jobs_pct)))
             .attr("r", 3)
             .style("fill", "#69b3a2")
             .style("opacity", 0.7)
             .on("mouseover", mouseover)
             .on("mousemove", mousemove)
             .on("mouseout", mouseout);
    }

    let selectedState = null; // Track the currently selected state

    // Function to create the map
    function createTariffMap(us, countyData) { // Pass countyData if needed for initial state
        // console.log("Creating map...");
        const states = topojson.feature(us, us.objects.states); // Convert TopoJSON to GeoJSON

        // Use Albers USA projection optimized for US map display
        const projection = d3.geoAlbersUsa()
            .fitSize([mapWidth, mapHeight], states); // Fit map to container size

        const path = d3.geoPath()
            .projection(projection);

        // Draw the states
        mapSvg.selectAll("path")
            .data(states.features)
            .enter().append("path")
            .attr("d", path)
            .attr("class", "state") // Add class for styling
            .style("fill", "#ccc")
            .style("stroke", "#fff")
            .style("stroke-width", "0.5px")
            .on("click", function(event, d) {
                const stateName = d.properties.name; 
                highlightState(stateName);
            })
            // Add map hover handlers
            .on("mouseover", function(event, d) {
                mapTooltip.style("opacity", 1);
                // Highlight state unless it's the selected one (which has its own color)
                if (selectedState === null || d.properties.name.toLowerCase() !== selectedState.toLowerCase()) {
                    d3.select(this).style("fill", "#aaa"); // Hover color
                }
            })
            .on("mousemove", function(event, d) {
                mapTooltip
                    .html(d.properties.name)
                    .style("left", (event.pageX + 10) + "px") 
                    .style("top", (event.pageY + 10) + "px");
            })
            .on("mouseout", function(event, d) {
                mapTooltip.style("opacity", 0);
                // Reset color unless it's the selected one
                 if (selectedState === null || d.properties.name.toLowerCase() !== selectedState.toLowerCase()) {
                    d3.select(this).style("fill", "#ccc"); // Default color
                 }
            });
        
        // Add click handler to map background to deselect
        mapSvg.on("click", function(event) {
            // Check if the click was on the background (not on a state path)
            if (event.target === mapSvg.node()) {
                highlightState(null); // Deselect all
            }
        });
    }

    // Function to highlight points for a selected state
    function highlightState(stateName) {
        if (!scatterPoints) return; 

        if (selectedState === stateName) { // Clicked the same state again
            selectedState = null; // Deselect
        } else {
            selectedState = stateName;
        }

        // Determine which points are selected
        const isSelected = d => selectedState !== null && d.state.toLowerCase() === selectedState.toLowerCase();

        // Apply styles and transitions
        scatterPoints
            .classed("selected-state", isSelected) // Apply class immediately
            .transition() 
            .duration(200)
            .style("fill", d => isSelected(d) ? "#ef476f" : "#ddd")
            .style("opacity", d => isSelected(d) ? 0.9 : 0.2)
            .attr("r", d => isSelected(d) ? 5 : 3)
            .style("stroke", d => isSelected(d) ? "black" : "none")
            .style("stroke-width", d => isSelected(d) ? 1 : 0);
            
        // Bring selected points to the front AFTER styling
        scatterPoints.filter(isSelected).raise();

         // Update map state colors
         mapSvg.selectAll(".state")
             .transition()
             .duration(200)
             .style("fill", d => (selectedState !== null && d.properties.name.toLowerCase() === selectedState.toLowerCase()) ? "#fca311" : "#ccc");
    }

}); 