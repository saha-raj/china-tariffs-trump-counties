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
        d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json') // Load US COUNTIES TopoJSON
    ]).then(function([csvData, usMapData]) {
        
        // --- Process CSV Data ---
        const processedData = csvData.map(d => {
            const trumpPct = +d.Trump_Pct;
            const affectedJobsPctRaw = +d.Affected_Jobs_Pct_of_Total_Votes;
            const stateName = d.State;
            const countyFips = d['County FIPS']; // Get FIPS code

            // Handle zero/negative values for log scale - replace with a small positive value
            const minValueForLog = 0.01; // Represent 0.01%
            let affectedJobsPct = Math.max(minValueForLog, affectedJobsPctRaw);

            if (isNaN(trumpPct) || isNaN(affectedJobsPct) || trumpPct < 0 || trumpPct > 100 || !stateName || !countyFips) { // No need to check affectedJobsPct < 0 now
                return null;
            }

            let processedEntry = {
                county: d.County,
                state: stateName,
                fips: countyFips,
                trump_pct: trumpPct,
                affected_jobs_pct: affectedJobsPct,
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
        fipsToState = {};
        processedData.forEach(d => { 
            // Ensure FIPS is a string with leading zero if needed
            const fipsString = String(Number(d.fips)).padStart(5, '0'); // Use consistent padded FIPS
            fipsToState[fipsString] = d.state; 
        });
        console.log("FIPS to State lookup populated.");

        // --- Create Visualizations ---
        createTariffScatterplot(processedData);
        createTariffMap(usMapData, processedData);

        // Apply initial map coloring (grayscale)
        highlightState(null);

    }).catch(function(error) {
        console.error('Error loading data:', error);
    });

    let scatterPoints; // Variable to hold the scatter points selection
    let countyDataByFips; // To store county data grouped by FIPS
    let stateCountyData; // To store county data grouped by state
    let mapPaths; // Variable to hold the map path selection
    let grayColorScale; // Grayscale for unselected
    let selectedColorScale; // Color scale for selected state
    let selectedState = null; // Track the currently selected state
    let highlightedCountyPath = null; // Track the map path highlighted by scatterplot click
    let highlightedScatterPoint = null; // Track the scatterplot point highlighted by click

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
        const y = d3.scaleLog() // USE LOG SCALE
            .base(10) // Base 10 for typical log scale
            .domain([yMin, yMax + (yMax * 0.1)]) // Domain starts from small positive value
            .range([scatterHeight, 0]); // Y scale is inverted for SVG

        // --- Tooltip (Now references the one created outside and appended to body) --- 
        // const tooltip = d3.select("#tariff-scatterplot-container .tooltip") // REMOVED selection from here
        //      .style("opacity", 0); 

        // if (tooltip.empty()) { ... } // REMOVED check

        // --- Event Handlers for Tooltip ---
        const mouseover = function(event, d) {
            // if (tooltip.empty()) return; // Use scatterTooltip instead
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
            // if (tooltip.empty()) return; // Use scatterTooltip instead
            if (scatterTooltip.style("opacity") === "0") return; // Don't update if hidden
             // console.log("Mousemove - Data:", d); // Log data for debugging
             scatterTooltip // Use scatterTooltip
                // Add <strong> tags for bold values
                .html(`State: <strong>${d.state}</strong><br>
                       County: <strong>${d.county}</strong><br>
                       Trump Vote: <strong>${d.trump_pct.toFixed(1)}%</strong><br>
                       Affected Jobs (% Votes): <strong>${d.affected_jobs_pct.toFixed(2)}%</strong>`)
                .style("left", (event.pageX + 15) + "px") // Use pageX for body-relative positioning
                .style("top", (event.pageY - 28) + "px"); // Use pageY for body-relative positioning
        };

        const mouseout = function(event, d) {
             // if (tooltip.empty()) return; // Use scatterTooltip instead
             scatterTooltip.style("opacity", 0); // Use scatterTooltip
             // Only reset styles if not the currently clicked point AND not selected by map
             if (this !== highlightedScatterPoint?.node() && !d3.select(this).classed('selected-state')) {
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

        // Add SPECIFIC horizontal grid lines using the LOG scale
        const yGridValues = [1, 10, 25, 50, 100]; // Specific values required
        // Add 0 to the grid values for the baseline if desired - NO, log can't handle 0
        // if (y.domain()[0] === 0) yGridValues.unshift(0); 
        
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
             // Use the log scale 
             .attr("cy", d => y(Math.max(yMin, d.affected_jobs_pct))) // Ensure value >= yMin for log scale
             .attr("r", 3)
             .style("fill", "#69b3a2")
             .style("opacity", 0.7)
             .on("mouseover", mouseover)
             .on("mousemove", mousemove)
             .on("mouseout", mouseout)
             // Add click listener to highlight county on map
             .on("click", function(event, d) {
                 // 0. Reset previously highlighted scatter point (if any)
                 if (highlightedScatterPoint) {
                     highlightedScatterPoint.style("fill", selectedState === null || highlightedScatterPoint.datum().state.toLowerCase() !== selectedState.toLowerCase() ? '#ccc' : '#ef476f'); // Revert to dimmed or selected state color
                      if (!highlightedScatterPoint.classed('selected-state')) { // Only remove stroke if not state-selected
                          highlightedScatterPoint.style("stroke", "none"); 
                      }
                 }

                 // 1. Reset previously highlighted county path (if any)
                 if (highlightedCountyPath) {
                     highlightedCountyPath
                         .style("stroke", "#fff")
                         .style("stroke-width", "0.2px");
                     highlightedCountyPath = null;
                 }

                 // 2. Find and highlight the corresponding county path on the map
                 const countyFips = String(Number(d.fips)).padStart(5, '0');
                 const targetPath = mapPaths.filter(mapData => String(Number(mapData.id)).padStart(5, '0') === countyFips);

                 if (!targetPath.empty()) {
                     targetPath
                         .raise() // Bring path to front
                         .style("stroke", "#ef476f") // Highlight color
                         .style("stroke-width", "1.5px"); // Highlight width
                     highlightedCountyPath = targetPath; // Store reference
                 } else {
                     console.warn(`Map path not found for FIPS: ${countyFips}`);
                 }

                 // 3. Highlight the clicked scatter point
                 highlightedScatterPoint = d3.select(this);
                 highlightedScatterPoint.style("fill", "#ef476f") // Highlight color
                                      .style("stroke", "black") // Add stroke to clicked point too
                                      .style("stroke-width", 1);

                 event.stopPropagation(); // Prevent click bubbling to body listener
             });
    }

    // Function to create the map
    function createTariffMap(us, plotData) { 
        const counties = topojson.feature(us, us.objects.counties); // Use counties geometry
        const statesMesh = topojson.mesh(us, us.objects.states, (a, b) => a !== b); // Interior borders
        const nationMesh = topojson.mesh(us, us.objects.nation); // Exterior border

        // fipsToState map is now populated in the outer scope

        // Define Color Scales
        const maxAffectedPct = d3.max(plotData, d => d.affected_jobs_pct) || 1; // Default max if no data
        // Use power scale for color again for consistency with visual spacing perception
        grayColorScale = d3.scaleSequential(d3.interpolateGreys)
                             .domain([0, Math.pow(maxAffectedPct, 0.5)]); // Apply exponent to domain max 
        const redInterpolator = d3.interpolateRgb("#fee", "#ef476f"); // Lighter start for red scale
        selectedColorScale = d3.scaleSequential(redInterpolator)
                               .domain([0, Math.pow(maxAffectedPct, 0.5)]); // Apply exponent to domain max

        const projection = d3.geoAlbersUsa()
            .fitSize([mapWidth, mapHeight], counties);

        const path = d3.geoPath().projection(projection);

        // Draw the COUNTIES
        mapPaths = mapSvg.selectAll("path") // Store selection globally
            .data(counties.features)
            .enter().append("path")
            .attr("d", path)
            .attr("class", "county") // Add class for styling and selection
            // Initial fill is just a light gray - highlightState will color it later
            .style("fill", '#eee') 
            .style("stroke", "#fff") // Keep county borders thin white
            .style("stroke-width", "0.2px") // Thinner stroke for counties
            .on("click", function(event, d) {
                const countyFips = String(Number(d.id)).padStart(5, '0'); // Standardize lookup key
                const stateName = fipsToState[countyFips]; // Get state name via FIPS lookup
                console.log(`Map Click: FIPS=${countyFips}, State=${stateName}`); // Log click event
                if (stateName) {
                    highlightState(stateName);
                } else {
                    console.warn("State not found for FIPS:", countyFips);
                    highlightState(null); // Deselect if state unknown
                }
            })
            .on("mouseover", function(event, d) {
                mapTooltip.style("opacity", 1);
                const countyFips = String(Number(d.id)).padStart(5, '0'); // Standardize lookup key
                const stateName = fipsToState[countyFips]; 
                // console.log(`Map Hover: Raw FIPS=${d.id}, Padded FIPS=${countyFips}, State=${stateName}`); // Log hover event
                
                // Show state name or "No data" in tooltip
                mapTooltip.html(stateName ? stateName : "No data"); 
                
                // Apply hover style (selected color scale) to all counties of this state, if not selected AND stateName exists
                if (stateName && stateName !== selectedState) {
                    // Use selectedColorScale for hover effect
                    applyCountyStyles(stateName, selectedColorScale); 
                }
            })
            .on("mousemove", function(event, d) {
                mapTooltip
                    .style("left", (event.pageX + 10) + "px") 
                    .style("top", (event.pageY + 10) + "px");
            })
            .on("mouseout", function(event, d) {
                mapTooltip.style("opacity", 0);
                const countyFips = String(Number(d.id)).padStart(5, '0'); // Standardize lookup key
                const stateName = fipsToState[countyFips]; 
                // Reset fill for the state if it's not the selected one
                if (stateName && stateName !== selectedState) {
                   // Revert to grayscale using grayColorScale explicitly
                   applyCountyStyles(stateName, grayColorScale); 
                }
            });
        
        // Draw state borders on top
        mapSvg.append("path")
            .datum(statesMesh) // Use interior borders mesh
            .attr("class", "state-borders-interior")
            .attr("d", path)
            .style("fill", "none")
            .style("stroke", "#dee2e6") // Consistent dark gray stroke 
            .style("stroke-width", "1px") // Consistent stroke width
            .style("pointer-events", "none"); 

        // Draw national outline on top of everything
        mapSvg.append("path")
            .datum(nationMesh) // Use exterior border mesh
            .attr("class", "nation-border-exterior")
            .attr("d", path)
            .style("fill", "none")
            .style("stroke", "#adb5bd") // Consistent dark gray stroke
            .style("stroke-width", "1px") // Consistent stroke width
            .style("pointer-events", "none"); 

        // Add click handler to the BODY to deselect state if clicked outside map/plot
        d3.select("body").on("click", function(event) {
            // Check if the clicked element is NOT a county path within the map SVG
            // Use closest() to see if the target or its ancestor is a map county path
            const targetElement = d3.select(event.target);
            const isMapCountyClick = targetElement.classed('county') || targetElement.select(function() { return this.closest('.county'); }).node();

            if (!isMapCountyClick) {
                // console.log("Clicked outside map paths, deselecting...");
                highlightState(null); // Deselect if click is not on a state path

                // Also deselect any county highlighted by scatterplot click
                if (highlightedCountyPath) {
                    highlightedCountyPath
                        .style("stroke", "#fff")
                        .style("stroke-width", "0.2px");
                    highlightedCountyPath = null;
                }
                // Also deselect scatter point highlight
                if (highlightedScatterPoint) {
                     highlightedScatterPoint.style("fill", '#69b3a2').style("stroke", "none"); // Revert to default
                     highlightedScatterPoint = null;
                }
            }
        });
    }

    // Function to highlight points and map counties for a selected state
    function highlightState(stateName) {
        // Reset any point-specific highlight first
        if (highlightedScatterPoint) {
            highlightedScatterPoint.style("fill", '#69b3a2').style("stroke", "none");
            highlightedScatterPoint = null;
        }
        if (highlightedCountyPath) {
            highlightedCountyPath.style("stroke", "#fff").style("stroke-width", "0.2px");
            highlightedCountyPath = null;
        }

        // console.log(`Highlighting state: ${stateName}`); // Keep commented out unless debugging
        if (!scatterPoints || !mapPaths || !countyDataByFips) {
            console.error("HighlightState called before elements or data were ready.");
            return; 
        }

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
             // If a state IS selected, highlight it and dim others.
             // If NO state is selected (stateName is null), reset ALL to default.
            .style("fill", d => selectedState === null ? '#69b3a2' : (isSelected(d) ? "#ef476f" : "#ccc")) 
            .style("opacity", d => selectedState === null ? 0.7 : (isSelected(d) ? 0.9 : 0.5)) // Increased opacity for dimmed points
            .attr("r", 3) // Keep radius constant
            .style("stroke", "none") // Ensure no stroke is applied
            .style("stroke-width", 0);
            
        scatterPoints.filter(isSelected).raise();

         // Update map COUNTY colors based on selection
         applyMapColoring(stateName); // Call helper to apply colors to all counties
    }

    // Helper function to apply coloring to ALL map counties based on selection
    function applyMapColoring(selectedStateName) {
        if (!mapPaths || !countyDataByFips || !grayColorScale || !selectedColorScale || !fipsToState) return;

        mapPaths 
            .transition()
            .duration(200)
            .style("fill", d => { 
                const countyFips = String(Number(d.id)).padStart(5, '0'); // Standardize lookup key
                const countyInfo = countyDataByFips[countyFips];
                if (!countyInfo) {
                    console.warn(`applyMapColoring: Data not found for FIPS ${countyFips}`);
                    return '#eee'; // Default gray if no data for county
                }
                
                const countyState = countyInfo.state;
                const valueForScale = Math.pow(Math.max(0.01, countyInfo.affected_jobs_pct), 0.5); // Use pow(0.5), ensure > 0 for scale

                // Determine fill based on selection state
                if (selectedStateName !== null && countyState.toLowerCase() === selectedStateName.toLowerCase()) {
                    // Use selected state color scale
                    return selectedColorScale(valueForScale);
                } else {
                    // Use grayscale for unselected states
                    return grayColorScale(valueForScale);
                }
            });
    }

    // Helper function to set fill for all counties in a state
    function applyCountyStyles(stateNameToStyle, colorScaleToUse) {
        if (!mapPaths || !fipsToState || !countyDataByFips || !colorScaleToUse ) return;

        mapPaths.filter(d => {
                const countyFips = String(Number(d.id)).padStart(5, '0'); // Standardize lookup key
                const stateLookup = fipsToState[countyFips];
                return stateLookup && stateLookup.toLowerCase() === stateNameToStyle.toLowerCase();
            })
            .style("fill", d => {
                const countyFips = String(Number(d.id)).padStart(5, '0'); // Standardize lookup key
                const countyInfo = countyDataByFips[countyFips];
                if (!countyInfo) {
                    console.warn(`applyCountyStyles: Data not found for FIPS ${countyFips} in state ${stateNameToStyle}`);
                    return '#eee'; // Revert pink back to neutral gray for missing data
                }
                
                const valueForScale = Math.pow(Math.max(0.01, countyInfo.affected_jobs_pct), 0.5); // Use pow(0.5), ensure > 0 for scale
                
                return colorScaleToUse(valueForScale); // Apply the passed scale
            });
    }

}); 