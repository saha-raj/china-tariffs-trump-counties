// Placeholder for scrollytelling visualization logic using D3.js and potentially a library like scrollama.

document.addEventListener('DOMContentLoaded', function() {
    console.log("Scrollytelling JS loaded.");
    // TODO: Implement scrollytelling setup and logic here.
}); 

// Scrollytelling visualization logic 
document.addEventListener('DOMContentLoaded', function() {
    console.log("Scrollytelling JS loaded.");

    // --- Configuration ---
    const scrollyContainer = d3.select('#scrollytelling-container');
    const graphicContainer = scrollyContainer.select('#scrolly-graphic');
    const mapContainer = graphicContainer.select('#scrolly-map-container');
    const scatterContainer = graphicContainer.select('#scrolly-scatterplot-container');
    // Get handles for the text above/below map
    const mapTextAbove = mapContainer.select('#scrolly-map-text-above');
    const mapTextBelow = mapContainer.select('#scrolly-map-text-below');

    if (mapContainer.empty() || scatterContainer.empty()) {
        console.error("Scrollytelling graphic containers (#scrolly-map-container or #scrolly-scatterplot-container) not found!");
        return;
    }
    
    // Clear placeholder content from SVG containers only
    mapContainer.select('svg').remove(); // Remove if exists from previous runs
    scatterContainer.select('svg').remove();
    mapContainer.selectAll('p').remove(); // Remove placeholder <p> if still there
    scatterContainer.selectAll('p').remove();

    // --- Visualization Setup ---
    const scrollyViz = (function() {
        let countyData = [];
        let usMapData = null;
        let countyDataByFips = {};
        let fipsToState = {};
        let stateFeatures = [];
        let projection, pathGenerator;
        let mapSvg, scatterSvg;
        let mapPaths, stateHighlightBorder, scatterPoints, annotationGroup, mapAnnotationGroup;
        let countyHighlightGroup, annotationLineGroup; // NEW groups
        let x, y;
        let yMin, yMax;
        let currentYMode = 'total'; 
        let topRedCounty = null;
        let topBlueCounty = null;
        let valueColorScale; // Scale for value shading (grayscale)
        let selectedColorScale; // Scale for highlighted states (purple)
        let mapColorMin, mapColorMax; // Declare in outer scope

        const scatterMargin = { top: 40, right: 30, bottom: 50, left: 60 }; 
        const mapMargin = { top: 10, right: 10, bottom: 10, left: 10 };
        let mapWidth, mapHeight, scatterWidth, scatterHeight; // Store dimensions

        function setupContainers() {
            const mapContainerWidth = mapContainer.node().clientWidth;
            mapHeight = mapContainer.node().clientHeight || 300; 
            const scatterContainerWidth = scatterContainer.node().clientWidth;
            scatterHeight = scatterContainer.node().clientHeight || 300; 

            mapWidth = mapContainerWidth - mapMargin.left - mapMargin.right;
            mapHeight = mapHeight - mapMargin.top - mapMargin.bottom; 
            scatterWidth = scatterContainerWidth - scatterMargin.left - scatterMargin.right;
            scatterHeight = scatterHeight - scatterMargin.top - scatterMargin.bottom;

            // Create SVGs
            mapSvg = mapContainer.append("svg")
                .attr("viewBox", `0 0 ${mapContainerWidth} ${mapContainer.node().clientHeight}`)
                .attr("preserveAspectRatio", "xMidYMid meet")
                .append("g")
                .attr("transform", `translate(${mapMargin.left},${mapMargin.top})`);
            
            scatterSvg = scatterContainer.append("svg")
                .attr("viewBox", `0 0 ${scatterContainerWidth} ${scatterContainer.node().clientHeight}`)
                .attr("preserveAspectRatio", "xMidYMid meet")
                .append("g")
                .attr("transform", `translate(${scatterMargin.left},${scatterMargin.top})`);
            annotationGroup = scatterSvg.append("g").attr("class", "scrolly-annotations").style("pointer-events", "none");
            
            // Create STATIC groups for map base layers
            mapSvg.append("g").attr("class", "counties"); // Group for base county fills
            mapSvg.append("g").attr("class", "static-borders"); // Group for state/nation lines

            // Create DYNAMIC groups for overlays (cleared/redrawn per scene)
            stateHighlightBorderGroup = mapSvg.append("g").attr("class", "scrolly-state-highlight-borders");
            countyHighlightGroup = mapSvg.append("g").attr("class", "county-highlight-borders");
            annotationLineGroup = mapSvg.append("g").attr("class", "annotation-lines");
            mapAnnotationGroup = mapSvg.append("g").attr("class", "scrolly-map-annotations"); 

            projection = d3.geoAlbersUsa();
            pathGenerator = d3.geoPath().projection(projection);
        }

        function setupColorScale() {
            // Setup Color Scale for Map Value Shading (Total Jobs)
            if (!countyData || countyData.length === 0) return; 

            // EXACT COPY from tariffs_map_plot.js lines 267-270 for domain calculation
            mapColorMin = d3.min(countyData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity); 
            mapColorMax = d3.max(countyData, d => d.total_jobs_affected_2024);
            mapColorMin = Math.max(1, isFinite(mapColorMin) ? mapColorMin : 1); // Ensure min is at least 1 and finite
            mapColorMax = Math.max(1, mapColorMax || 1); // Ensure max is at least 1 (Reverted to this exact logic)
            // End Exact Copy
             
            // EXACT COPY from tariffs_map_plot.js line 278 (using valueColorScale name)
            valueColorScale = d3.scaleSequentialLog(d3.interpolateRgb("#ffffff", "#767b91")) 
                 .domain([mapColorMin, mapColorMax]);

            // Purple scale for selected state (matching original viz)
            selectedColorScale = d3.scaleSequentialLog(d3.interpolateRgb("#FED8E9", "#b5179e"))
                 .domain([mapColorMin, mapColorMax]);

            // DEBUG LOG
            console.log(`Scrolly Map Color Scale Setup: Domain=[${mapColorMin}, ${mapColorMax}], Scale Defined=${!!valueColorScale}`);
        }

        function processData(csvData) {
            const processed = csvData.map(d => {
                const trumpPct = +d.Trump_Pct;
                const affectedJobsPctRaw = +d.Affected_Jobs_Pct_of_Total_Votes;
                const harrisPct = +d.Harris_Pct;
                const stateName = d.State;
                const countyFips = d['County FIPS'];
                const totalAffectedJobsRaw = +d.Total_Jobs_Affected_by_Tariffs_2024;

                const minValueForLog = 0.01;
                let affectedJobsPct = Math.max(minValueForLog, affectedJobsPctRaw);
                const totalAffectedJobs = isNaN(totalAffectedJobsRaw) ? 0 : totalAffectedJobsRaw;

                if (isNaN(trumpPct) || isNaN(harrisPct) || isNaN(affectedJobsPct) || trumpPct < 0 || trumpPct > 100 || harrisPct < 0 || harrisPct > 100 || !stateName || !countyFips) {
                    return null;
                }

                return {
                    county: d.County,
                    state: stateName,
                    fips: String(Number(countyFips)).padStart(5, '0'),
                    trump_pct: trumpPct,
                    harris_pct: harrisPct,
                    affected_jobs_pct: affectedJobsPct,
                    total_jobs_affected_2024: totalAffectedJobs
                };
            }).filter(d => d !== null);

            countyData = processed;
            countyDataByFips = {};
            fipsToState = {};
            processed.forEach(d => {
                countyDataByFips[d.fips] = d;
                fipsToState[d.fips] = d.state;
            });
        }

        function scrolly_getPointColor(d) {
            return d.trump_pct > d.harris_pct ? "#f76369" : "#1b98e0";
        }

        function scrolly_findMaxCounties(data, mode) {
             if (!data || data.length === 0) return { maxRed: null, maxBlue: null };
             const yValueField = mode === 'percentage' ? 'affected_jobs_pct' : 'total_jobs_affected_2024';
             let maxRed = null, maxBlue = null, maxRedValue = -Infinity, maxBlueValue = -Infinity;
             data.forEach(d => {
                 const value = d[yValueField];
                 if (typeof value !== 'number' || isNaN(value)) return;
                 const isRed = d.trump_pct > d.harris_pct;
                 if (isRed) { if (value > maxRedValue) { maxRedValue = value; maxRed = d; } }
                 else { if (value > maxBlueValue) { maxBlueValue = value; maxBlue = d; } }
             });
             // Store the found counties globally within this scope
             topRedCounty = maxRed;
             topBlueCounty = maxBlue;
             return { maxRed, maxBlue };
        }

        function scrolly_formatAnnotationValue(value, mode) {
            if (mode === 'percentage') {
                if (value <= 0.01) return '<0.01';
                return d3.format(".1f")(value);
            } else {
                return d3.format(",.0f")(value);
            }
        }

        // Modified to draw EITHER scatter annotations OR map annotations
        function scrolly_drawScatterAnnotations(annotationData, mode, xScale, yScale) {
             annotationGroup.selectAll("*").remove(); 
            const yValueField = mode === 'percentage' ? 'affected_jobs_pct' : 'total_jobs_affected_2024';
            const annotations = [];
            if (annotationData.maxRed) annotations.push({ data: annotationData.maxRed });
            if (annotationData.maxBlue) annotations.push({ data: annotationData.maxBlue });
            const annotationWidth = 250, annotationHeight = 55;
            // Decrease offset further to pull box down more
            const yOffset = 5; 

            annotations.forEach(anno => {
                const d = anno.data;
                if (!d || !xScale || !yScale) return;
                const pointX = xScale(d.trump_pct);
                let pointY = yScale(d[yValueField]);
                if (isNaN(pointX) || isNaN(pointY)) { console.warn("Invalid scale result for annotation", d); return; }
                if (mode === 'total' && d.total_jobs_affected_2024 === 0) { pointY = yScale(yMin); }
                else if (mode === 'percentage' && d.affected_jobs_pct <= yMin) { pointY = yScale(yMin); }
                if (isNaN(pointY)) { console.warn("Invalid y-scale result after adjustment for annotation", d, yMin); return; }

                // Center box horizontally above point
                const foX = pointX - annotationWidth / 4; // Shift right from fully centered
                const foY = pointY - annotationHeight - yOffset; // Position box vertically
                const formattedValue = scrolly_formatAnnotationValue(d[yValueField], mode);
                const textLine1 = `${d.county}, ${d.state}`;
                const textLine2 = `Affected jobs: <strong>${formattedValue}</strong>${mode === 'percentage' ? '% of votes cast' : ''}`;
                const fo = annotationGroup.append("foreignObject")
                   .attr("x", foX).attr("y", foY).attr("width", annotationWidth).attr("height", annotationHeight)
                   .style("opacity", 1); 
                fo.append("xhtml:div")
                   .attr("class", "scatter-annotation-box")
                   .html(`<div>${textLine1}</div><div>${textLine2}</div>`);
            });
        }
        
        // Modified to accept showAnnotations parameter
        function updateScatterplot(showAnnotations) {
            if (!scatterSvg || !countyData.length) return;
             // Ensure dimensions are set
            // ... dimension checks ...
            
            // Clear previous elements
            scatterSvg.selectAll("g.x-axis, g.y-axis, g.grid, g.scrolly-annotations").remove(); 
            scatterSvg.selectAll("circle.dot").remove(); // Remove points directly if not in a group
            scatterSvg.selectAll(".x-axis-label").remove(); // REMOVE existing label
            
            // Recreate annotation group (since it was cleared with selectAll("g"))
            annotationGroup = scatterSvg.append("g").attr("class", "scrolly-annotations").style("pointer-events", "none"); 

            currentYMode = 'total'; // Keep total mode for now
            x = d3.scaleLinear().domain([0, 100]).range([0, scatterWidth]);

            // Calculate vertical drawing zone (60% height, centered)
            const drawingAreaHeight = scatterHeight;
            const plotHeight60 = drawingAreaHeight * 0.6;
            const plotOffsetY = drawingAreaHeight * 0.2; // 20% top/bottom padding within drawing area

            if (currentYMode === 'percentage') {
                 yMin = 0.01;
                 yMax = d3.max(countyData, d => d.affected_jobs_pct) || 100; 
                 // Adjust Y range to map to central 60%
                 y = d3.scaleLog().base(10).domain([yMin, yMax + (yMax * 0.1)])
                      .range([plotOffsetY + plotHeight60, plotOffsetY]);
             } else { 
                 yMin = d3.min(countyData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity);
                 yMin = Math.max(1, (isFinite(yMin) ? yMin : 1)); 
                 yMax = d3.max(countyData, d => d.total_jobs_affected_2024) || 1; 
                 yMax = Math.max(yMax, yMin + 1);
                 // Adjust Y range to map to central 60%
                 y = d3.scaleLog().base(10).domain([yMin, yMax + (yMax * 0.1)])
                      .range([plotOffsetY + plotHeight60, plotOffsetY]);
             }
            if (isNaN(y.domain()[0]) || isNaN(y.domain()[1])) {
                 console.error("Invalid Y scale configuration:", y.domain(), y.range()); return;
            }

            // Axes & Grid
            const xAxis = d3.axisBottom(x)
                .tickValues([0, 25, 50, 75, 100]) // Specify tick values
                .tickFormat(d => `${d}%`);
            scatterSvg.append("g").attr("class", "x-axis")
               .attr("transform", `translate(0,${plotOffsetY + plotHeight60})`) 
               .call(xAxis).selectAll("text")
                 // Increase tick label font size
                 .style("font-size", "13px") 
                 .style("fill", "#666").style("font-family", "'JetBrains Mono', monospace");
            
            let yAxisTicks, yAxisFormat;
            if (currentYMode === 'percentage') { yAxisTicks = [0.01, 0.1, 1, 10, 100]; yAxisFormat = d => d3.format(".2~f")(d) + "%"; }
            else { yAxisTicks = [1, 10, 100, 1000, 10000, 50000]; yAxisFormat = d3.format(","); }
            const yAxis = d3.axisLeft(y).tickValues(yAxisTicks).tickFormat(yAxisFormat);
            scatterSvg.append("g").attr("class", "y-axis").call(yAxis).selectAll("text")
                 // Increase tick label font size
                 .style("font-size", "13px") 
                 .style("fill", "#666").style("font-family", "'JetBrains Mono', monospace");
            scatterSvg.append("g").attr("class", "grid y-grid").call(d3.axisLeft(y).tickValues(yAxisTicks).tickSize(-scatterWidth).tickFormat("")).call(g => g.select(".domain").remove()).selectAll("line").style("stroke", "#e0e0e0").style("stroke-dasharray", "2,2");

            // Points (no changes needed)
             scatterPoints = scatterSvg.append('g').selectAll("circle.dot").data(countyData, d => d.fips).join("circle").attr("class", "dot").attr("cx", d => x(d.trump_pct)).attr("cy", d => {const value = currentYMode === 'percentage' ? d.affected_jobs_pct : d.total_jobs_affected_2024; const scaledValue = (currentYMode === 'percentage' && value <= yMin) || (currentYMode === 'total' && value === 0) ? yMin : value; return y(scaledValue); }).attr("r", 3).style("fill", scrolly_getPointColor).style("stroke", "none").style("opacity", 0.7);

            // Conditionally draw annotations
            if (showAnnotations) {
                const annotationData = { maxRed: topRedCounty, maxBlue: topBlueCounty }; // Use stored top counties
                scrolly_drawScatterAnnotations(annotationData, currentYMode, x, y);
            } else {
                 annotationGroup.selectAll("*").remove(); // Ensure removed if not shown
            }

            // Add X axis label at the end (after points/annotations)
            scatterSvg.append("text")
                .attr("class", "x-axis-label")
                .attr("text-anchor", "middle")
                .attr("x", scatterWidth / 2)
                // Position below the adjusted x-axis
                .attr("y", plotOffsetY + plotHeight60 + scatterMargin.bottom - 15) 
                .style("font-size", "14px") // Increase axis label font size
                .style("fill", "#333")
                .style("font-family", "'JetBrains Mono', monospace")
                .text("Trump Vote Share (2020)");
        }

        // REMOVE updateMap function - replaced by drawBaseMapAndBorders and drawMapOverlays
        // function updateMap(displayMode, countiesToHighlightArray) { /* ... */ }

        // --- NEW Drawing Functions --- 
        function drawBaseMapAndBorders() {
            if (!mapSvg || !usMapData || !countyData.length) return;
            console.log("Drawing Base Map and Borders (ONCE)");

            // Fit projection
            projection.fitSize([mapWidth, mapHeight], topojson.feature(usMapData, usMapData.objects.counties));

            // Draw Counties with Grayscale Fill
            const countiesGroup = mapSvg.select("g.counties");
            countiesGroup.selectAll("path.county")
                .data(topojson.feature(usMapData, usMapData.objects.counties).features, d => d.id)
                .join(
                    enter => enter.append("path")
                        .attr("class", "county")
                        .attr("stroke", "#ccc")
                        .attr("stroke-width", 0.5)
                        .each(function(d) { 
                             const fips = d.id;
                             if (countyDataByFips[fips]) {
                                 d.properties = { ...d.properties, data: countyDataByFips[fips] };
                             }
                         }),
                    update => update, 
                    exit => exit.remove()
                )
                .attr("d", pathGenerator)
                .attr("fill", d => { // Apply grayscale fill here, ONE TIME
                    const countyProperties = d.properties?.data;
                    if (!countyProperties) return "#eee"; 
                    // UNCONDITIONALLY apply grayscale based on total jobs for the base map
                    if (!valueColorScale || mapColorMin === undefined) { return "#eee"; }
                    const value = countyProperties.total_jobs_affected_2024;
                    const safeValue = (value > 0) ? value : mapColorMin; 
                    const color = valueColorScale(safeValue); 
                    return color || "#eee"; 
                 });

            // Draw Static State/Nation Borders
            const staticBordersGroup = mapSvg.select("g.static-borders");
            staticBordersGroup.selectAll("*").remove(); // Clear just in case
            staticBordersGroup.append("path").datum(topojson.mesh(usMapData, usMapData.objects.states, (a, b) => a !== b)).attr("class", "state-borders").attr("fill", "none").attr("stroke", "#aaa").attr("stroke-width", 1).attr("d", pathGenerator);
            staticBordersGroup.append("path").datum(topojson.mesh(usMapData, usMapData.objects.nation)).attr("class", "nation-border").attr("fill", "none").attr("stroke", "#767b91").attr("stroke-width", 1).attr("d", pathGenerator);
        }

        function drawMapOverlays(countiesToHighlightArray) {
            if (!mapSvg || !usMapData || !stateFeatures) return; 
            console.log("Drawing Map Overlays");
            
            // Clear previous overlays first
            clearMapOverlays();

            if (!countiesToHighlightArray || countiesToHighlightArray.length === 0) return; // Exit if nothing to highlight

            const highlightFipsSet = new Set(countiesToHighlightArray.map(c => c?.fips).filter(Boolean));
            const highlightStateSet = new Set(countiesToHighlightArray.map(c => c?.state).filter(Boolean));

            // Draw State Highlight Borders - ADD FILL AND OPACITY HERE
            let stateFeaturesToDraw = stateFeatures.filter(f => highlightStateSet.has(f.properties.name));
            stateHighlightBorderGroup.selectAll("path.scrolly-state-highlight-border")
                 .data(stateFeaturesToDraw).enter().append("path")
                     .attr("class", "scrolly-state-highlight-border") 
                     // .attr("fill", "none") // REMOVE fill none
                     .attr("stroke", "#2a324b")
                     .attr("stroke-width", 2).style("pointer-events", "none")
                     .style("fill", "#6a0dad") // ADD Purple fill color
                     .style("fill-opacity", 0.2) // ADD Opacity
                     .attr("d", d => pathGenerator(d))
                     .raise(); 

            // Draw County Highlight Borders
            const countyFeaturesToDraw = countiesToHighlightArray.map(countyData => {
                return countyData ? topojson.feature(usMapData, usMapData.objects.counties).features.find(f => f.id === countyData.fips) : null;
            }).filter(Boolean); 
            countyHighlightGroup.selectAll("path.county-highlight-border")
               .data(countyFeaturesToDraw).enter().append("path")
                   .attr("class", "county-highlight-border") 
                   .attr("d", d => pathGenerator(d))
                   .raise(); 

            // Draw Annotation Boxes and Lines
            const mapBoxWidth = 280; // INCREASED width further
            const mapBoxHeight = 80;  // Keep height
            
            countiesToHighlightArray.forEach((countyData, index) => {
                if (!countyData) return;
                const feature = countyFeaturesToDraw[index]; 
                if (!feature) return;
                const centroid = pathGenerator.centroid(feature);
                if (isNaN(centroid[0]) || isNaN(centroid[1])) { console.warn("Invalid centroid for", countyData); return; }

                let targetY, boxY;
                let textContentHtml;
                const boxX = centroid[0] - (mapBoxWidth / 2);

                if (countyData === topRedCounty) {
                    targetY = mapHeight * 0.20; 
                    boxY = targetY - mapBoxHeight / 2; 
                    // Define color based on winner
                    const color = scrolly_getPointColor(topRedCounty);
                    // Wrap county/state in styled span
                    textContentHtml = `<span style="color: ${color}; font-weight: bold;">${topRedCounty?.county || 'N/A'}, ${topRedCounty?.state || 'N/A'} (Trump Won)</span><br/>Total Jobs: ${scrolly_formatAnnotationValue(topRedCounty?.total_jobs_affected_2024, 'total')}<br/>Industries: Manufacturing, Agriculture`;
                } else if (countyData === topBlueCounty) {
                    targetY = mapHeight * 0.80; 
                    boxY = targetY - mapBoxHeight / 2;
                    // Define color based on winner
                    const color = scrolly_getPointColor(topBlueCounty);
                    // Wrap county/state in styled span
                    textContentHtml = `<span style="color: ${color}; font-weight: bold;">${topBlueCounty?.county || 'N/A'}, ${topBlueCounty?.state || 'N/A'} (Harris Won)</span><br/>Total Jobs: ${scrolly_formatAnnotationValue(topBlueCounty?.total_jobs_affected_2024, 'total')}<br/>Industries: Energy/Oil, Aerospace`;
                } else { return; }
                
                boxY = Math.max(0, Math.min(mapHeight - mapBoxHeight, boxY));
                const lineTargetY = boxY + (countyData === topRedCounty ? mapBoxHeight : 0); // Connect to bottom edge of top box, top edge of bottom box

                if (Math.abs(centroid[1] - lineTargetY) > 5) { 
                    annotationLineGroup.append("line")
                        .attr("class", "annotation-line") 
                        .attr("x1", centroid[0])
                        .attr("y1", centroid[1])
                        .attr("x2", centroid[0]) // Vertical
                        .attr("y2", lineTargetY); // Connect to relevant box edge
                }

                const fo = mapAnnotationGroup.append("foreignObject")
                    .attr("x", boxX)
                    .attr("y", boxY)
                    .attr("width", mapBoxWidth)
                    .attr("height", mapBoxHeight);

                fo.append("xhtml:div").attr("class", "map-annotation-box").html(textContentHtml);
            });
        }

        function clearMapOverlays() {
             console.log("Clearing Map Overlays");
             stateHighlightBorderGroup.selectAll("*").remove();
             countyHighlightGroup.selectAll("*").remove();
             annotationLineGroup.selectAll("*").remove();
             mapAnnotationGroup.selectAll("*").remove();
        }

        // --- Scene Handlers --- 
        function showScene1a() {
            console.log("Activating Scene 1a");
            updateScatterplot(false); // No scatter annotations
            clearMapOverlays(); // Remove borders, lines, map annotations
            // Base map fill remains untouched

            // Ensure scatter point borders are removed
            if (scatterPoints && topRedCounty) {
                scatterPoints.filter(d => d.fips === topRedCounty.fips).style("stroke", null);
            }
            if (scatterPoints && topBlueCounty) {
                scatterPoints.filter(d => d.fips === topBlueCounty.fips).style("stroke", null);
            }
        }

        function showScene1b() {
            console.log("Activating Scene 1b");
             // Ensure top counties are calculated (using currentYMode, which is 'total')
             scrolly_findMaxCounties(countyData, currentYMode); 
             const highlightCounties = [topRedCounty, topBlueCounty].filter(Boolean); 
            
            updateScatterplot(true); // SHOW scatter annotations
            drawMapOverlays(highlightCounties); // Draw borders, lines, map annotations
            // Base map fill remains untouched

            // Add borders to the specific scatter points
            if (scatterPoints && topRedCounty) {
                scatterPoints.filter(d => d.fips === topRedCounty.fips)
                    .style("stroke", "black")
                    .style("stroke-width", 2.5)
                    .raise(); // Bring to front
            }
            if (scatterPoints && topBlueCounty) {
                scatterPoints.filter(d => d.fips === topBlueCounty.fips)
                    .style("stroke", "black")
                    .style("stroke-width", 2.5)
                    .raise(); // Bring to front
            }
        }

        // --- Public Methods --- 
        return {
            init: function() {
                setupContainers(); 

                d3.csv('data/tariffs_industries_votes_county.csv')
                    .then(csvData => {
                        console.log("CSV data loaded.");
                        processData(csvData);

                        // Now load JSON data
                        return d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
                    })
                    .then(mapData => {
                        console.log("JSON map data loaded.");
                        usMapData = mapData;
                        console.log("Map data assigned (start):", JSON.stringify(usMapData)?.substring(0, 200));

                        // --- VALIDATE MAP DATA --- 
                        if (!usMapData || typeof usMapData !== 'object' || !usMapData.objects) {
                            console.error("Loaded map data is invalid or missing 'objects' property:", usMapData);
                            mapContainer.html("<p style='color: red; text-align: center; padding: 20px;'>Error: Invalid map data loaded.</p>");
                            return; // Stop processing
                        }
                        // --- END VALIDATION --- 

                        // This line should now be safe if validation passes
                        stateFeatures = topojson.feature(usMapData, usMapData.objects.states).features;
                        
                        // Setup color scale now that data is loaded
                        setupColorScale(); 
                        
                        // DRAW BASE MAP AND BORDERS (ONCE)
                        drawBaseMapAndBorders(); 

                        console.log(`Before initial showScene1a: mapColorMin=${mapColorMin}, valueColorScale defined=${!!valueColorScale}`);

                        // Initial setup reflects Scene 1a (just ensures overlays are clear)
                        showScene1a(); 

                        console.log("Scrolly viz initialized and showing Scene 1a.");

                    })
                    .catch(error => {
                        // This catch will now handle errors from EITHER csv or json loading/processing
                        console.error('Error during data loading/processing:', error);
                        graphicContainer.html("<p style='color: red; text-align: center; padding: 20px;'>Error loading visualization data.</p>");
                    });
            },
            showScene1a: showScene1a,
            showScene1b: showScene1b
        };
     })(); // End IIFE
 
// ... (keep init call and scroll handling logic) ...
     // --- Initialize Visualization ---
     scrollyViz.init();
 
     // --- Scroll Position Logic ---
    const wrapper = document.getElementById('scrolly-wrapper');
    function handleScroll() {
        const wrapperNode = wrapper;
        if (!wrapperNode) return;
        const rect = wrapperNode.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const scrollStart = wrapperNode.offsetTop;
        const scrollEnd = scrollStart + wrapperNode.offsetHeight - viewportHeight;
        const currentScroll = window.scrollY;
        let progress = (currentScroll - scrollStart) / (scrollEnd - scrollStart);
        if (currentScroll >= scrollStart && currentScroll <= scrollEnd) {
            progress = Math.max(0, Math.min(1, progress));
        } else if (currentScroll < scrollStart) {
            progress = 0;
        } else { 
            progress = 1;
        }
        // Trigger state change based on progress
        if (progress < 0.5) {
            scrollyViz.showScene1a();
        } else {
            scrollyViz.showScene1b();
        }
    }
    window.addEventListener('scroll', handleScroll);
    handleScroll(); 

    // Resize listener TODO
    // window.addEventListener('resize', () => { });

}); // End DOMContentLoaded 