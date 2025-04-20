// This file will contain the JavaScript code for the tariffs map and scatterplot visualization using D3.js. 

document.addEventListener('DOMContentLoaded', function () {
    // Define margins, width, and height for the main scatter plot
    const scatterMargin = { top: 80, right: 30, bottom: 70, left: 60 };
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
    const scatterHeight = Math.max(100, 650 - scatterMargin.top - scatterMargin.bottom); // Reduced height to 650, ensure minimum

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

    // --- Define Projection and Path Generator (Moved outside updateVisualization) ---
    // Map Projection - Use Albers USA which includes AK and HI appropriately scaled
    const projection = d3.geoAlbersUsa(); // Define projection here
    // Path generator - Define here, will set projection fit later
    const pathGenerator = d3.geoPath().projection(projection);

    // Create a div for the SCATTERPLOT tooltip (initially hidden, appended to body)
    const scatterTooltip = d3.select("body") 
        .append("div")
        .attr("class", "tooltip") // Keep the tooltip class for styling
        .style("opacity", 0) // Start hidden
        .style("position", "absolute") 
        .style("pointer-events", "none") 
        .style("background-color", "rgba(240, 240, 240, 0.9)") // Semi-transparent light gray bg
        .style("border", "none") // Remove border
        .style("border-radius", "5px") // Keep radius
        .style("padding", "10px") // Keep padding
        .style("min-width", "150px")
        .style("z-index", "10") 
        .style("font-size", "14px") // Larger font size
        .style("color", "#333"); // Dark gray text color

    // Create a div for the MAP tooltip (initially hidden)
    const mapTooltip = d3.select("body") // Append to body to avoid clipping issues
        .append("div")
        .attr("class", "map-tooltip") // Use a different class 
        .style("opacity", 0)
        // Restore styles to match scatterplot tooltip
        .style("background-color", "rgba(240, 240, 240, 0.9)") 
        .style("border", "none") 
        .style("border-radius", "5px") 
        .style("padding", "10px") 
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("font-size", "14px") 
        .style("color", "#333") 
        .style("font-family", "var(--ui-font), sans-serif"); // Match UI font

    // --- Global Variables (accessible within functions) ---
    let scatterPoints; // Variable to hold the scatter points selection
    let countyDataByFips; // To store county data grouped by FIPS
    let stateCountyData; // To store county data grouped by state
    let mapPaths; // Variable to hold the map path selection
    let grayColorScale; // Grayscale for unselected
    let selectedColorScale; // Color scale for selected state
    let selectedState = null; // Track the currently selected state
    let highlightedCountyPath = null; // Track the map path highlighted by scatterplot click
    let highlightedScatterPoint = null; // Track the scatterplot point highlighted by click
    let fipsToState = {}; // FIPS to State lookup
    let stateFeatures = []; // Store state features
    let stateHighlightBorder = null; // Store selection for the highlight border path
    let mapColorMin, mapColorMax; // Moved declaration to outer scope
    let yMin; // Moved yMin declaration to outer scope for access in highlightState
    let yAxisMode = 'percentage'; // Added state variable: 'percentage' or 'total'
    let currentPlotData = []; // Store current processed data
    let currentUsMapData = null; // Store current map data

    // Load BOTH CSV and TopoJSON data
    Promise.all([
        d3.csv('data/tariffs_industries_votes_county.csv'),
        d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json') // Load US COUNTIES TopoJSON
    ]).then(function([csvData, usMapData]) {
        
        // --- Process CSV Data ---
        // (Keep data processing logic here as it's needed before visualization)
        const processedData = csvData.map(d => {
            const trumpPct = +d.Trump_Pct;
            const affectedJobsPctRaw = +d.Affected_Jobs_Pct_of_Total_Votes;
            const harrisPct = +d.Harris_Pct; // Read Harris percentage
            const stateName = d.State;
            const countyFips = d['County FIPS']; // Get FIPS code
            const totalAffectedJobsRaw = +d.Total_Jobs_Affected_by_Tariffs_2024; // *** CORRECTED column name ***

            // Handle zero/negative values for log scale - replace with a small positive value
            const minValueForLog = 0.01; // Represent 0.01%
            let affectedJobsPct = Math.max(minValueForLog, affectedJobsPctRaw);

            // Also validate total affected jobs
            const totalAffectedJobs = isNaN(totalAffectedJobsRaw) ? 0 : totalAffectedJobsRaw;

            if (isNaN(trumpPct) || isNaN(harrisPct) || isNaN(affectedJobsPct) || trumpPct < 0 || trumpPct > 100 || harrisPct < 0 || harrisPct > 100 || !stateName || !countyFips) { // Added checks for harrisPct
                return null;
            }

            let processedEntry = {
                county: d.County,
                state: stateName,
                fips: countyFips,
                trump_pct: trumpPct,
                harris_pct: harrisPct, // Store harris_pct
                affected_jobs_pct: affectedJobsPct,
                total_jobs_affected_2024: totalAffectedJobs // *** CORRECTED field name ***
            };

            return processedEntry;
        }).filter(d => d !== null);

        // Populate the FIPS lookup map HERE, after processing CSV
        countyDataByFips = {}; 
        processedData.forEach(d => {
            // Ensure FIPS is a string with leading zero if needed (assuming 5 digits)
            // Convert to number first to handle potential string/number mismatch, then pad
            const fipsString = String(Number(d.fips)).padStart(5, '0'); 
            countyDataByFips[fipsString] = d;
        });
        console.log("County data lookup by FIPS populated.");

        // Populate FIPS to State lookup map HERE as well
        // fipsToState = {}; // Defined outside now
        processedData.forEach(d => { 
            // Ensure FIPS is a string with leading zero if needed
            const fipsString = String(Number(d.fips)).padStart(5, '0'); // Use consistent padded FIPS
            fipsToState[fipsString] = d.state; 
        });
        console.log("FIPS to State lookup populated.");

        // --- Store State Features ---
        stateFeatures = topojson.feature(usMapData, usMapData.objects.states).features;
        // console.log("State Features:", stateFeatures); // Log to check properties, e.g., d.properties.name

        // --- Initial SVG Setup for Highlight Border ---
        stateHighlightBorder = mapSvg.append("path")
            .attr("class", "state-highlight-border")
            .attr("fill", "none")
            .attr("stroke", "#2a324b") // Dark border color
            .attr("stroke-width", 1.5)
            .style("pointer-events", "none") // Ignore mouse events
            .attr("d", null); // Initially no geometry

        // --- Call the Main Update Function ---
        currentPlotData = processedData; // Store data globally
        currentUsMapData = usMapData; // Store map data globally
        updateVisualization(); // Initial call without arguments

        // Initial map coloring now happens inside updateVisualization

    }).catch(function(error) {
        console.error('Error loading data:', error);
    });


    // --- Main Function to Create/Update Visualizations ---
    function updateVisualization() { // No arguments needed, uses global data and mode
        
        // --- Scatterplot Logic (Moved from createTariffScatterplot) ---

        // Group data by state for easier lookup later (needed for state highlighting)
        stateCountyData = d3.group(currentPlotData, d => d.state);
        // console.log("Data grouped by state:", stateCountyData);

        // Clear existing axes and points before redrawing (if needed for future updates)
        scatterSvg.selectAll(".x-axis").remove();
        scatterSvg.selectAll(".y-axis").remove();
        scatterSvg.selectAll(".grid").remove();
        scatterSvg.selectAll(".dot").remove();
        scatterSvg.selectAll(".x-axis-label").remove();
        scatterSvg.selectAll(".y-axis-label").remove();
        scatterSvg.selectAll(".chart-title").remove(); // Remove previous title
        
        // Map clearing (paths need to be handled differently)
        mapSvg.selectAll(".county").remove(); // Remove old county paths
        mapSvg.selectAll(".state-borders").remove(); // Remove old state borders
        mapSvg.selectAll(".map-legend").remove(); // Remove old legend
        
        // --- Scales (Conditional based on yAxisMode) ---
        const x = d3.scaleLinear()
            .domain([0, 100])
            .range([0, scatterWidth]);

        // Y scale: Conditional - Log for percentage, Log for total
        let y, yMax; // yMin defined outside now
        if (yAxisMode === 'percentage') {
            yMin = 0.01; // Minimum value for log scale (matching zero replacement)
            yMax = d3.max(currentPlotData, d => d.affected_jobs_pct); 
            y = d3.scaleLog()
                .base(10) 
                .domain([yMin, yMax + (yMax * 0.1)]) 
                .range([scatterHeight, 0]); 
        } else { // yAxisMode === 'total'
            // NEW Log scale for total count
            yMin = d3.min(currentPlotData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity);
            yMin = Math.max(1, yMin); // Ensure min is at least 1
            yMax = d3.max(currentPlotData, d => d.total_jobs_affected_2024);
            y = d3.scaleLog()
                .base(10)
                .domain([yMin, yMax + (yMax * 0.1)]) // Add padding to max
                .range([scatterHeight, 0]);
        }

        // Color Scale (for map) - Conditional domain
        if (yAxisMode === 'percentage') {
            mapColorMin = 0.01;
            mapColorMax = d3.max(currentPlotData, d => d.affected_jobs_pct);
        } else {
            mapColorMin = d3.min(currentPlotData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity); // CORRECTED field
            mapColorMax = d3.max(currentPlotData, d => d.total_jobs_affected_2024); // CORRECTED field
            mapColorMin = Math.max(1, mapColorMin); // Ensure min is at least 1 for log scale stability if used
        }

        // Use log scale for color regardless of mode for better visual differentiation? Try it.
        selectedColorScale = d3.scaleSequentialLog(d3.interpolateRgb("#FED8E9", "#b5179e")) // Custom Purple Scale
            .domain([mapColorMin, mapColorMax]); 
        grayColorScale = d3.scaleSequentialLog(d3.interpolateRgb("#ffffff", "#767b91")) 
             .domain([mapColorMin, mapColorMax]);

        // --- Scatterplot Tooltip Event Handlers ---
        const mouseover = function(event, d) {
            scatterTooltip.style("opacity", 1); // Use scatterTooltip
            // Only apply hover effect if it's not the currently clicked point
            if (this !== highlightedScatterPoint?.node()) {
                // Don't change radius/stroke on hover if it's part of a selected state
                if (!d3.select(this).classed('selected-state')) {
                    d3.select(this).attr("r", 5).style("stroke", "black");
                }
            }
        };

        const mousemove = function(event, d) {
            if (scatterTooltip.style("opacity") === "0") return; // Don't update if hidden
             scatterTooltip // Use scatterTooltip
                // Add <strong> tags for bold values
                .html(`State: <strong>${d.state}</strong><br>
                       County: <strong>${d.county}</strong><br>
                       Trump Vote: <strong>${d.trump_pct.toFixed(1)}%</strong><br>
                       ${yAxisMode === 'percentage' ? 'Affected Jobs (% Votes)' : 'Total Affected Jobs'}: <strong>${yAxisMode === 'percentage' ? d.affected_jobs_pct.toFixed(2)+'%' : d3.format(",")(d.total_jobs_affected_2024)}</strong>`) // Conditional label and value - CORRECTED field
                .style("left", (event.pageX + 15) + "px") // Use pageX for body-relative positioning
                .style("top", (event.pageY - 28) + "px"); // Use pageY for body-relative positioning
        };

        const mouseout = function(event, d) {
             scatterTooltip.style("opacity", 0); // Use scatterTooltip
             // Only reset styles if not the currently clicked point AND not selected by map
             if (this !== highlightedScatterPoint?.node() && !d3.select(this).classed('selected-state')) {
                 d3.select(this).attr("r", 3).style("stroke", "none");
             } 
        };

        // --- Scatterplot Axes & Gridlines ---
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

        // Add Y axis and Gridlines (Conditional)
        let yAxis, yGridValues;
        if (yAxisMode === 'percentage') {
            yGridValues = [0.01, 0.1, 1, 10, 25, 50, 100]; // Specific grid lines for log scale
            yAxis = d3.axisLeft(y)
                .tickValues(yGridValues) 
                .tickFormat(d => d3.format(".2~f")(d) + "%"); // Append % sign
        } else { // yAxisMode === 'total'
            // Let D3 choose nice tick values for linear scale - NO, use specific values
            // yAxis = d3.axisLeft(y)
            //     .ticks(5) // Suggest number of ticks
            //     .tickFormat(d3.format(",")); // Format as comma-separated numbers
            // yGridValues = [10, 100, 1000, 10000, 100000]; // Specific values for total log scale
            yGridValues = [50, 500, 5000, 50000]; // Specific values for total log scale
            yAxis = d3.axisLeft(y)
                .tickValues(yGridValues)
                .tickFormat(d3.format(",")); // Format as comma-separated numbers
        }
        
        const yGrid = yAxis // Use the same axis definition for grid
            .tickSize(-scatterWidth); // Lines across the plot
            // .tickFormat(""); // Remove labels from grid lines themselves

        const yGridGroup = scatterSvg.append("g") // Store reference to grid group
            .attr("class", "grid y-grid") // Add class for styling
            .call(yGrid)
            .call(g => g.select(".domain").remove()); // Remove the axis line itself

        // Style Y grid axis tick labels (optional adjustment)
        yGridGroup.selectAll("text")
            .style("font-size", "12px")
            .style("fill", "#666")
            .style("font-family", "'JetBrains Mono', monospace");

        // Style grid lines
        scatterSvg.selectAll(".grid line")
            .style("stroke", "#e0e0e0")
            .style("stroke-dasharray", "2,2");

        // --- Scatterplot Axis Labels ---
        // Add X axis label
        scatterSvg.append("text")
            .attr("class", "x-axis-label")
            .attr("text-anchor", "middle")
            .attr("x", scatterWidth / 2)
            .attr("y", scatterHeight + scatterMargin.bottom - 25) // Adjust position
            .style("font-size", "14px")
            .style("fill", "#333")
            .style("font-family", "'JetBrains Mono', monospace")
            .text("Trump Vote Share (2020)");

        // Add Y axis label - WITH INTERACTIVE TOGGLE --> MOVED TO TITLE
        // const yLabel = scatterSvg.append("text")
        //     .attr("class", "y-axis-label")
        //     .attr("text-anchor", "middle")
        //     .attr("transform", "rotate(-90)")
        //     .attr("y", 0 - scatterMargin.left + 15) 
        //     .attr("x", 0 - (scatterHeight / 2))
        //     .style("font-size", "14px")
        //     .style("fill", "#333")
        //     .style("font-family", "'JetBrains Mono', monospace");
            // .text("Affected Jobs (% of Total Votes)"); // Old static label

        // Append tspans for the toggle --> MOVED TO TITLE
        // yLabel.append("tspan").text("Affected Jobs (");
        // yLabel.append("tspan") ... etc ...
        // yLabel.append("tspan").text(")");

        // Add Title (remains the same) --> REPLACED WITH INTERACTIVE TITLE
        // scatterSvg.append("text")
        //     .attr("class", "chart-title")
        //     .attr("x", scatterWidth / 2)
        //     .attr("y", 0 - scatterMargin.top / 2) // Position above the plot area
        //     .attr("text-anchor", "middle")
        //     .style("font-size", "18px")
        //     .style("font-weight", "600")
        //     .style("font-family", "var(--title-font)")
        //     .style("fill", "#333")
        //     .text("County Tariff Impact vs. 2020 Trump Vote Share");
            
        // Add NEW Interactive Title
        const chartTitle = scatterSvg.append("text")
            .attr("class", "chart-title-interactive") // New class
            .attr("x", 0) // Align with Y axis (x=0)
            .attr("y", 0 - scatterMargin.top / 2) // Position above plot area
            .attr("text-anchor", "start") // Left align
            .style("font-size", "16px") // Title font size
            .style("font-weight", "200") // Title weight
            .style("font-family", "'JetBrains Mono', monospace") // Use JetBrains Mono
            .style("fill", "#333")
            ;

        // Append tspans for the toggle to the new title
        chartTitle.append("tspan").text("Affected Jobs [");

        chartTitle.append("tspan")
            .attr("class", "toggle-option toggle-percentage")
            .classed("active", yAxisMode === 'percentage')
            .text("as % of votes cast")
            .on("click", () => {
                if (yAxisMode !== 'percentage') {
                    yAxisMode = 'percentage';
                    updateVisualization(); // Redraw
                }
            });

        chartTitle.append("tspan").text(" or ");

        chartTitle.append("tspan")
            .attr("class", "toggle-option toggle-total")
            .classed("active", yAxisMode === 'total')
            .text("total count")
            .on("click", () => {
                if (yAxisMode !== 'total') {
                    yAxisMode = 'total';
                    updateVisualization(); // Redraw
                }
            });

        chartTitle.append("tspan").text("]");

        // --- Scatterplot Points (Dots) ---
        scatterPoints = scatterSvg.append('g') // Append points to a group
            .selectAll("circle.dot") // Select circles with class 'dot'
            .data(currentPlotData, d => d.fips) // Use FIPS as key for object constancy
            .enter()
            .append("circle")
                .attr("class", "dot") // Add class for potential styling/selection
                .attr("cx", d => x(d.trump_pct))
                .attr("cy", d => {
                    if (yAxisMode === 'percentage') {
                        return y(d.affected_jobs_pct);
                    } else { // 'total' mode (log scale)
                        // If total jobs is 0, plot at the bottom (yMin); otherwise use the log scale.
                        return y(d.total_jobs_affected_2024 === 0 ? yMin : d.total_jobs_affected_2024);
                    }
                })
                .attr("r", 3) // Initial radius
                .style("fill", d => getPointColor(d)) // Use helper function for color
                .style("stroke", "none") // No initial stroke
                .style("opacity", 0.7) // Base opacity
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseout", mouseout)
            // Add click listener to highlight point and corresponding map county
            .on("click", function(event, d) {
                // console.log("Scatterplot point clicked:", d);
                highlightPointAndCounty(this, d.fips);
                event.stopPropagation(); // Prevent click from bubbling to body
            });
            

        // --- Map Logic (Moved from createTariffMap) ---

        // Map Projection - Use Albers USA which includes AK and HI appropriately scaled
        // const projection = d3.geoAlbersUsa() // MOVED OUTSIDE
        //     .fitSize([mapWidth, mapHeight], topojson.feature(usMapData, usMapData.objects.counties)); // Fit counties
        // Fit projection here, now that we have data
        projection.fitSize([mapWidth, mapHeight], topojson.feature(currentUsMapData, currentUsMapData.objects.counties));

        // Path generator
        // const pathGenerator = d3.geoPath().projection(projection); // MOVED OUTSIDE

        // --- Map Tooltip Event Handlers --- (Conditional Text)
        const mapMouseover = function(event, d) {
            const fips = d.id;
            const hoveredStateName = fipsToState[fips];

            if (hoveredStateName) {
                // Update tooltip
                mapTooltip.style("opacity", 1)
                          .html(`State: <strong>${hoveredStateName}</strong>`); // Show only state name

                // Apply fill highlight if not selected
                if (hoveredStateName !== selectedState) {
                    // Fill counties
                    mapPaths.filter(p => fipsToState[p.id] === hoveredStateName)
                        .transition().duration(50) // Faster transition for hover
                        .attr("fill", p => {
                            const data = p.properties?.data;
                            if (!data) return "#eee"; 
                            const value = yAxisMode === 'percentage' ? data.affected_jobs_pct : data.total_jobs_affected_2024;
                            const safeValue = (yAxisMode === 'percentage' || value > 0) ? value : mapColorMin; 
                            return selectedColorScale(safeValue); // Use selected (purple) scale for hover
                        });
                    // Add border highlight on hover ONLY if no state is currently selected
                    if (selectedState === null) {
                        updateStateHighlightBorder(hoveredStateName);
                    }
                }
            }
        };

        const mapMousemove = function(event, d) {
             if (mapTooltip.style("opacity") === "0") return;
             mapTooltip.style("left", (event.pageX + 25) + "px") // Increased offset from 15 to 25
                     .style("top", (event.pageY - 28) + "px");
        };
        
        const mapMouseout = function(event, d) {
            mapTooltip.style("opacity", 0);
            const fips = d.id;
            const hoveredStateName = fipsToState[fips];

            // Revert the fill highlight if the state exists and is not the selected one
            if (hoveredStateName && hoveredStateName !== selectedState) {
                 mapPaths.filter(p => fipsToState[p.id] === hoveredStateName)
                    .transition().duration(50)
                    .attr("fill", p => {
                        const data = p.properties?.data;
                        if (!data) return "#eee";
                        const value = yAxisMode === 'percentage' ? data.affected_jobs_pct : data.total_jobs_affected_2024;
                        const safeValue = (yAxisMode === 'percentage' || value > 0) ? value : mapColorMin;
                        return grayColorScale(safeValue); // Revert to gray scale
                    });
                 // Remove hover border ONLY if no state is currently selected
                 if (selectedState === null) {
                    updateStateHighlightBorder(null);
                 }
            }
            // Always revert the highlight border to match the selected state (or none)
            // updateStateHighlightBorder(selectedState); // This might be redundant now? Let's test without it first.
            // If the above line *is* needed, it should likely come *after* the conditional removal above.
            // Let's keep it commented out for now to test the simpler logic.
        };

        // Draw Counties
        mapPaths = mapSvg.append("g")
            .selectAll("path.county")
            .data(topojson.feature(currentUsMapData, currentUsMapData.objects.counties).features)
            .enter().append("path")
            .attr("class", "county") // Add class for styling/selection
            .attr("d", pathGenerator)
            .attr("fill", "#eee") // Initial light gray fill
            .attr("stroke", "#ccc") // Light gray stroke
            .attr("stroke-width", 0.5)
            .each(function(d) {
                // Join CSV data here
                const fips = d.id; // FIPS is typically the 'id' in US Atlas TopoJSON
                if (countyDataByFips[fips]) {
                    d.properties = { ...d.properties, data: countyDataByFips[fips] }; // Add our data to properties
                } else {
                    // console.warn(`No data found for county FIPS: ${fips}`);
                    // Optionally assign default properties or leave empty
                }
            })
            .on("mouseover", mapMouseover)
            .on("mousemove", mapMousemove)
            .on("mouseout", mapMouseout)
            // Add click listener to highlight state and points
             .on("click", function(event, d) {
                const fips = d.id;
                const stateName = fipsToState[fips]; // Use lookup map
                if (stateName) {
                    // Toggle state selection
                    selectedState = (selectedState === stateName) ? null : stateName; 
                    highlightState(selectedState); // Call the main highlight function
                } else {
                    // console.log("Map click - State not found for FIPS:", fips);
                    // Optionally deselect if clicking outside a known county
                    selectedState = null;
                    highlightState(null);
                    highlightPointAndCounty(null, null); // Deselect highlights
                }
                event.stopPropagation(); // Prevent click from bubbling to body
             });

        // Draw State Borders (optional, but helpful)
        mapSvg.append("path")
            .datum(topojson.mesh(currentUsMapData, currentUsMapData.objects.states, (a, b) => a !== b))
            .attr("class", "state-borders")
            .attr("fill", "none")
            .attr("stroke", "#aaa") // Slightly darker state borders
            .attr("stroke-width", 1)
            .attr("d", pathGenerator);

        // Draw National Outline (darker)
        mapSvg.append("path")
            .datum(topojson.mesh(currentUsMapData, currentUsMapData.objects.nation))
            .attr("class", "nation-border")
            .attr("fill", "none")
            .attr("stroke", "#767b91") // Darker gray for national border
            .attr("stroke-width", 1) // Reduced thickness from 1.5 to 1
            .attr("d", pathGenerator);

        // --- Apply Initial Coloring ---
        // This replaces the call originally made after createTariffMap
        highlightState(null); // Start with all states deselected (grayscale)

        // --- Add Body Click Listener for Deselection ---
        d3.select("body").on("click.deselect", function(event) { // Added .deselect namespace
            // Check if the click target is NOT within the map or scatterplot containers <-- REMOVED THIS CHECK
            // const mapClicked = event.target.closest('#tariff-map-container svg');
            // const scatterClicked = event.target.closest('#tariff-scatterplot-container svg');
            
            // If clicked outside both SVGs and a state is currently selected <-- SIMPLIFIED CONDITION
            // If a click reaches the body and a state is selected, deselect it.
            // Clicks on map paths or scatter points should have been stopped by stopPropagation.
            if (selectedState !== null) {
                // console.log("Body click detected, deselecting state...");
                selectedState = null; // Deselect state
                highlightState(null); // Reset map/point styles
                highlightPointAndCounty(null, null); // Reset specific highlights
            }
        });

    } // --- End of updateVisualization ---


    // --- Helper Functions (Can remain outside updateVisualization if they don't rely on its internal scope beyond arguments/globals) ---

    // Helper function to determine point color based on vote percentage
    function getPointColor(d) {
        return d.trump_pct > d.harris_pct ? "#f76369" : "#1b98e0";
    }

    // Function to handle highlighting state on map and points on scatterplot
    function highlightState(stateName) {
        selectedState = stateName; // Update the global selected state

        // Apply coloring to the map counties
        applyMapColoring(selectedState);

        // Apply styles to scatterplot points
        scatterPoints.each(function(d) {
            const point = d3.select(this);
            const isSelectedState = stateName && d.state === stateName;
            const isClickedPoint = highlightedScatterPoint && point.node() === highlightedScatterPoint.node();

            // Determine if the point represents a zero value for the current Y axis
            let isZeroValue;
            if (yAxisMode === 'percentage') {
                // For log scale %, 0 was mapped to yMin (e.g., 0.01)
                // Use a small tolerance to account for floating point issues if necessary
                isZeroValue = d.affected_jobs_pct <= yMin; // Check against the effective minimum
            } else { // 'total' mode (also log)
                // For total jobs, we explicitly check for 0
                isZeroValue = d.total_jobs_affected_2024 === 0;
            }

            // Determine display based on selection and zero value
            let displayStyle;
            if (stateName === null) { // No state selected
                // Hide zero-value points, show others
                displayStyle = isZeroValue ? "none" : "block";
            } else { // A state IS selected
                // Hide zero-value points only if they are NOT in the selected state
                displayStyle = (isZeroValue && !isSelectedState) ? "none" : "block";
            }
            
            // Apply display style FIRST
            point.style("display", displayStyle);

            // Apply visual styles ONLY if the point is displayed
            if (displayStyle === "block") {
                 point.classed('selected-state', isSelectedState)
                     .transition().duration(300)
                     .style("opacity", isSelectedState || !stateName ? 0.7 : 0.1) // Dim unselected if a state IS selected
                     .attr("r", isClickedPoint ? 6 : (isSelectedState ? 4 : 3)) 
                     .style("stroke", isClickedPoint ? "#6a0dad" : "none") 
                     .style("stroke-width", isClickedPoint ? 2 : 0);
            } else {
                 // Ensure hidden points don't retain selected state class or transition artifacts
                 point.classed('selected-state', false)
                      .interrupt() // Stop any ongoing transition
                      .style("opacity", 0); // Ensure fully hidden visually if needed
                      // Setting display to none should be sufficient, but opacity 0 adds safety
            }
        });
        
        // Update the state highlight border
        updateStateHighlightBorder(selectedState);
    }
    
    // Function to apply map coloring based on selected state
    function applyMapColoring(selectedStateName) {
        if (selectedStateName) {
            // Color selected state using selectedColorScale, others gray
            applyCountyStyles(selectedStateName, selectedColorScale);
        } else {
            // No state selected, color all using grayColorScale
            applyCountyStyles(null, grayColorScale); 
        }
    }

    // Function to apply fill styles to county paths (Conditional Value)
    function applyCountyStyles(stateNameToStyle, colorScaleToUse) {
        mapPaths.transition().duration(500)
            .attr("fill", d => {
                const data = d.properties?.data;
                if (!data) return "#eee"; // Default gray for no data

                const value = yAxisMode === 'percentage' ? data.affected_jobs_pct : data.total_jobs_affected_2024; // Conditional value - CORRECTED field
                const currentState = data.state;

                // If a specific state is selected, style it differently
                if (stateNameToStyle) { 
                    if (currentState === stateNameToStyle) {
                        return colorScaleToUse(value); // Use the provided color scale (selectedColorScale)
                    } else {
                        return grayColorScale(value); // Use grayscale for non-selected states
                    }
                } else {
                    // No state selected, use the provided scale (grayColorScale) for all
                    // Ensure value is valid for the scale (e.g., non-zero for log)
                    const safeValue = (yAxisMode === 'percentage' || value > 0) ? value : mapColorMin; // Use min domain value if total is 0 for log scale
                    return colorScaleToUse(safeValue); 
                }
            });
    }

    // Function to handle highlighting sync between scatter and map on click
    function highlightPointAndCounty(pointElement, countyFips) {
        // Reset previous highlights first
        if (highlightedScatterPoint) {
            // Reset stroke to none, keep fill and radius based on state selection
            highlightedScatterPoint.style("stroke", "none")
                                     .attr("r", d => selectedState && d.state === selectedState ? 4 : 3);
        }
        if (highlightedCountyPath) {
            // Reset stroke to default light gray
            highlightedCountyPath.style("stroke", "#ccc").style("stroke-width", 0.5);
        }
        highlightedScatterPoint = null;
        highlightedCountyPath = null;

        // Find the corresponding elements
        let targetPoint = pointElement ? d3.select(pointElement) : null;
        let targetPath = null;

        if (countyFips) {
            // Find map path
            mapPaths.each(function(d) {
                if (d.id === countyFips) {
                    targetPath = d3.select(this);
                }
            });
            // Find scatter point if not provided
            if (!targetPoint) {
                scatterPoints.each(function(d) {
                    if (d.fips === countyFips) {
                        targetPoint = d3.select(this);
                    }
                });
            }
        }

        // Apply new highlights
        if (targetPoint) {
            // Use purple stroke for highlight
            targetPoint.style("stroke", "#6a0dad").style("stroke-width", 2).attr("r", 6).raise(); // Bring to front
            highlightedScatterPoint = targetPoint;
        }
        if (targetPath) {
            // Use purple stroke for highlight
            targetPath.style("stroke", "#6a0dad").style("stroke-width", 2).raise(); // Bring to front
            highlightedCountyPath = targetPath;
        }
    }

    // --- NEW Helper Function to draw state border highlight ---
    function updateStateHighlightBorder(stateNameToHighlight) {
        if (!stateHighlightBorder || !stateFeatures || !pathGenerator) return; // Safety check

        if (stateNameToHighlight) {
            // Find the feature for the state to highlight
            // Assuming state features have a property like 'name' that matches fipsToState values
            const featureToDraw = stateFeatures.find(f => f.properties.name === stateNameToHighlight);
            
            if (featureToDraw) {
                stateHighlightBorder.attr("d", pathGenerator(featureToDraw));
            } else {
                // console.warn(`State feature not found for: ${stateNameToHighlight}`);
                stateHighlightBorder.attr("d", null); // Hide if feature not found
            }
        } else {
            // No state to highlight, remove the border
            stateHighlightBorder.attr("d", null);
        }
        
        // Ensure the border path is drawn on top
        stateHighlightBorder.raise();
    }


}); // End of DOMContentLoaded