// === Draw.io MCP Extension — draw.io Plugin (drawio-plugin.js) ===
// This file runs in the PAGE CONTEXT (same as draw.io), giving it
// direct access to mxGraph, EditorUi, and all graph APIs.
// It is injected by content.js via <script> tag.

(function () {
  "use strict";

  // Wait for draw.io to initialize its editor
  function waitForEditor(callback) {
    const check = setInterval(() => {
      if (window.Draw && window.Draw.loadPlugin) {
        clearInterval(check);
        Draw.loadPlugin(callback);
      }
    }, 500);
  }

  waitForEditor(function (ui) {
    const graph = ui.editor.graph;
    const model = graph.getModel();
    console.log("[drawio-plugin] MCP v2 plugin loaded, graph available");

    // === Listen for MCP requests from content script ===

    window.addEventListener("message", (event) => {
      if (event.data?.source !== "drawio-mcp-content") return;
      if (event.data?.type !== "MCP_REQUEST") return;

      const request = event.data.payload;
      const eventName = request.__event;
      const requestId = request.__request_id;

      console.log(`[drawio-plugin] Handling event: ${eventName}`);

      let result;
      try {
        switch (eventName) {
          case "render_subgraph":
            result = handleRenderSubgraph(graph, model, request);
            break;
          case "export_diagram":
            result = handleExportDiagram(ui, graph, request);
            break;
          case "modify_subgraph":
            result = handleModifySubgraph(graph, model, request);
            break;
          case "get_diagram_state":
            result = handleGetDiagramState(graph, model, request);
            break;
          default:
            result = { success: false, error: `Unknown event: ${eventName}` };
        }
      } catch (err) {
        console.error(`[drawio-plugin] Error handling ${eventName}:`, err);
        result = { success: false, error: err.message };
      }

      // Send reply back through content script
      sendReply(eventName, requestId, result);
    });

    function sendReply(eventName, requestId, data) {
      window.postMessage(
        {
          source: "drawio-mcp-plugin",
          type: "MCP_REPLY",
          payload: {
            __event: `${eventName}.${requestId}`,
            ...data,
          },
        },
        "*"
      );
    }

    // ==================================================================
    // EVENT HANDLERS
    // ==================================================================

    function handleRenderSubgraph(graph, model, request) {
      const parent = graph.getDefaultParent();
      const nodeMap = {}; // id → mxCell, for edge wiring

      model.beginUpdate();
      try {
        // Optionally clear canvas
        if (request.clear_first) {
          graph.removeCells(graph.getChildCells(parent, true, true));
        }

        // 1. Insert all vertices (no coordinates — auto-size handles it)
        for (const node of request.nodes) {
          const parentCell = node.parent
            ? nodeMap[node.parent] || model.getCell(node.parent) || parent
            : parent;
          const style =
            node.style ||
            "rounded=1;whiteSpace=wrap;html=1;autosize=1;";
          const cell = graph.insertVertex(
            parentCell,  // parent cell
            node.id,     // cell id
            node.label,  // display label
            0,
            0,           // x, y (layout will reposition)
            120,
            60,          // default w, h (autosize will adjust)
            style
          );
          nodeMap[node.id] = cell;

          // Apply autosize to fit label text
          graph.updateCellSize(cell);

          // Set custom data attributes
          if (node.data) {
            for (const [key, value] of Object.entries(node.data)) {
              graph.setAttributeForCell(cell, key, value);
            }
          }
        }

        // 2. Insert all edges
        for (const edge of request.edges || []) {
          const sourceCell =
            nodeMap[edge.source] || model.getCell(edge.source);
          const targetCell =
            nodeMap[edge.target] || model.getCell(edge.target);
          if (sourceCell && targetCell) {
            const edgeStyle =
              edge.style || "edgeStyle=orthogonalEdgeStyle;rounded=1;";
            graph.insertEdge(
              parent,
              edge.id || null,
              edge.label || "",
              sourceCell,
              targetCell,
              edgeStyle
            );
          }
        }

        // 3. Apply layout algorithm
        if (request.layout && request.layout !== "none") {
          applyLayout(graph, parent, request.layout);
        }
      } finally {
        model.endUpdate();
      }

      // 4. Optionally export SVG
      let svg_base64 = null;
      if (request.return_svg) {
        svg_base64 = exportSvgBase64(graph);
      }

      return {
        success: true,
        node_count: request.nodes.length,
        edge_count: (request.edges || []).length,
        svg_base64,
      };
    }

    function handleExportDiagram(ui, graph, request) {
      if (request.format === "svg_text") {
        const svgNode = graph.getSvg();
        const serializer = new XMLSerializer();
        const svgText = serializer.serializeToString(svgNode);
        return { success: true, svg_text: svgText };
      } else {
        return { success: true, svg_base64: exportSvgBase64(graph) };
      }
    }

    function handleModifySubgraph(graph, model, request) {
      const parent = graph.getDefaultParent();

      model.beginUpdate();
      try {
        // Remove nodes
        for (const id of request.remove_node_ids || []) {
          const cell = model.getCell(id);
          if (cell) graph.removeCells([cell]);
        }

        // Remove edges
        for (const id of request.remove_edge_ids || []) {
          const cell = model.getCell(id);
          if (cell) graph.removeCells([cell]);
        }

        // Add new nodes
        for (const node of request.add_nodes || []) {
          const style =
            node.style ||
            "rounded=1;whiteSpace=wrap;html=1;autosize=1;";
          const cell = graph.insertVertex(
            parent,
            node.id,
            node.label,
            0,
            0,
            120,
            60,
            style
          );
          graph.updateCellSize(cell);

          if (node.data) {
            for (const [key, value] of Object.entries(node.data)) {
              graph.setAttributeForCell(cell, key, value);
            }
          }
        }

        // Add new edges
        for (const edge of request.add_edges || []) {
          const src = model.getCell(edge.source);
          const tgt = model.getCell(edge.target);
          if (src && tgt) {
            graph.insertEdge(
              parent,
              edge.id || null,
              edge.label || "",
              src,
              tgt,
              edge.style || "edgeStyle=orthogonalEdgeStyle;rounded=1;"
            );
          }
        }

        // Update existing nodes
        for (const update of request.update_nodes || []) {
          const cell = model.getCell(update.id);
          if (!cell) continue;
          if (update.label !== undefined) {
            graph.cellLabelChanged(cell, update.label);
          }
          if (update.style !== undefined) {
            graph.setCellStyle(update.style, [cell]);
          }
          graph.updateCellSize(cell);
        }

        // Re-layout if requested
        if (request.relayout) {
          applyLayout(graph, parent, request.relayout);
        }
      } finally {
        model.endUpdate();
      }

      let svg_base64 = null;
      if (request.return_svg) {
        svg_base64 = exportSvgBase64(graph);
      }

      return { success: true, svg_base64 };
    }

    function handleGetDiagramState(graph, model, request) {
      const parent = graph.getDefaultParent();
      const cells = model.getChildCells(parent, true, true);
      const nodes = [];
      const edges = [];

      for (const cell of cells) {
        if (model.isVertex(cell)) {
          nodes.push({
            id: cell.id,
            label: graph.getLabel(cell) || "",
            style: model.getStyle(cell) || "",
            geometry: cell.geometry
              ? {
                  x: cell.geometry.x,
                  y: cell.geometry.y,
                  w: cell.geometry.width,
                  h: cell.geometry.height,
                }
              : null,
          });
        } else if (model.isEdge(cell)) {
          edges.push({
            id: cell.id,
            source: cell.source?.id || null,
            target: cell.target?.id || null,
            label: graph.getLabel(cell) || "",
            style: model.getStyle(cell) || "",
          });
        }
      }

      return { success: true, nodes, edges };
    }

    // ==================================================================
    // HELPERS
    // ==================================================================

    function applyLayout(graph, parent, layoutType) {
      let layout;
      switch (layoutType) {
        case "hierarchical":
          layout = new mxHierarchicalLayout(graph);
          layout.interRankCellSpacing = 120;
          layout.intraCellSpacing = 80;
          break;
        case "organic":
          layout = new mxFastOrganicLayout(graph);
          layout.forceConstant = 150;
          break;
        case "circle":
          layout = new mxCircleLayout(graph);
          break;
        case "tree":
          layout = new mxCompactTreeLayout(graph, false);
          layout.levelDistance = 40;
          layout.nodeDistance = 20;
          break;
        default:
          return;
      }
      layout.execute(parent);
    }

    function exportSvgBase64(graph) {
      try {
        const svgNode = graph.getSvg(
          null,  // background
          1,     // scale
          0,     // border
          false, // noCrop
          null,  // imgExport
          false, // ignoreSelection
          true,  // currentPage
          null,  // backgroundImage
          null   // getLinkTarget
        );
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgNode);
        return btoa(unescape(encodeURIComponent(svgString)));
      } catch (err) {
        console.error("[drawio-plugin] SVG export failed:", err);
        return null;
      }
    }
  });
})();
