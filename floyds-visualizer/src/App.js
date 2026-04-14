import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';

// --- IGNORE HARMLESS REACT FLOW RESIZE ERROR overlays ---
const hideResizeObserverError = () => {
  window.addEventListener('error', e => {
    if (e.message && (e.message.includes('ResizeObserver') || e.message.includes('undelivered notifications'))) {
      const errOverlay = document.getElementById('webpack-dev-server-client-overlay');
      if (errOverlay) errOverlay.style.display = 'none';
      e.stopImmediatePropagation();
    }
  });
};
hideResizeObserverError();

// --- MINIMALIST CUSTOM NODE ---
const StationNode = ({ data }) => {
  return (
    <div style={{
      background: data.isHighlighted ? '#1a1a1a' : '#0a0a0a',
      border: `2px solid ${data.isHighlighted ? '#00e5ff' : '#444'}`,
      borderRadius: '50%',
      width: '28px', height: '28px',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      boxShadow: data.isHighlighted ? '0 0 15px rgba(0, 229, 255, 0.4)' : 'none',
      transition: 'all 0.4s ease',
      position: 'relative'
    }}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />

      <div style={{
        position: 'absolute', top: '36px',
        color: data.isHighlighted ? '#fff' : '#888',
        fontFamily: 'monospace', fontSize: '10px', whiteSpace: 'nowrap',
        textShadow: data.isHighlighted ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
        left: '50%', transform: 'translateX(-50%)'
      }}>
        {data.label}
      </div>
    </div>
  );
};

const nodeTypes = { station: StationNode };

function App() {
  const [activePage, setActivePage] = useState('basic');
  const [isFloydsApplied, setIsFloydsApplied] = useState(false);

  const [matrixData, setMatrixData] = useState(null);
  const [nextMatrix, setNextMatrix] = useState(null);
  const [nodeNames, setNodeNames] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);

  const [sourceIndex, setSourceIndex] = useState('');
  const [destIndex, setDestIndex] = useState('');
  const [routeDetails, setRouteDetails] = useState(null);

  const [dynamicV, setDynamicV] = useState(4);
  const [dynamicK, setDynamicK] = useState(0);
  const [dynamicMatrices, setDynamicMatrices] = useState([]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const getLayoutPosition = useCallback((page, index, totalNodes) => {
    if (page === 'basic') {
      const radius = 120;
      const angle = (index / totalNodes) * 2 * Math.PI - Math.PI / 2;
      return { x: 200 + radius * Math.cos(angle), y: 150 + radius * Math.sin(angle) };
    }
    const layouts = {
      'transit': [{x: 100, y: 150}, {x: 300, y: 150}, {x: 300, y: 350}, {x: 300, y: 50}, {x: 500, y: 250}],
      'security': [{x: 250, y: 50}, {x: 100, y: 150}, {x: 400, y: 150}, {x: 150, y: 300}, {x: 350, y: 300}]
    };
    return layouts[page]?.[index] || { x: 0, y: 0 };
  }, []);

  const buildGraph = useCallback((bNodes, bEdges, activePathEdges = null, page, currentK = 0) => {
    const newNodes = bNodes.map((name, index) => ({
      id: index.toString(), type: 'station',
      position: getLayoutPosition(page, index, bNodes.length),
      data: { label: name, isHighlighted: activePathEdges?.some(e => e.u === index || e.v === index) || (page === 'basic' && currentK > 0 && index === currentK - 1) },
    }));

    const newEdges = bEdges.map((edge) => {
      let isHigh = activePathEdges?.some(e => (e.u === edge.u && e.v === edge.v) || (e.u === edge.v && e.v === edge.u));
      return {
        id: `e${edge.u}-${edge.v}`,
        source: edge.u.toString(), target: edge.v.toString(),
        type: page === 'transit' ? 'smoothstep' : 'straight',
        label: `${edge.w}`, animated: isHigh,
        style: { strokeWidth: isHigh ? 3 : 1, stroke: isHigh ? '#00e5ff' : '#333', filter: isHigh ? 'drop-shadow(0px 0px 4px rgba(0, 229, 255, 0.6))' : 'none' },
        labelStyle: { fill: isHigh ? '#fff' : '#666', fontFamily: 'monospace', fontSize: '11px' },
        labelBgStyle: { fill: '#0a0a0a', fillOpacity: 0.9 },
      };
    });
    setNodes(newNodes); setEdges(newEdges);
  }, [getLayoutPosition, setNodes, setEdges]);

  const generateDynamicGraph = useCallback((vCount) => {
    const bNodes = Array.from({length: vCount}, (_, i) => `${i + 1}`);
    const bEdges = [];
    for(let i=0; i<vCount; i++) {
      for(let j=0; j<vCount; j++) {
        if(i !== j && Math.random() > 0.4) bEdges.push({ u: i, v: j, w: Math.floor(Math.random() * 9) + 1 });
      }
    }
    let dist = Array(vCount).fill(null).map(() => Array(vCount).fill('INF'));
    for(let i=0; i<vCount; i++) dist[i][i] = 0;
    bEdges.forEach(e => dist[e.u][e.v] = e.w);
    const matrices = [dist.map(row => [...row])];
    for(let k=0; k<vCount; k++) {
       let nextDist = dist.map(row => [...row]);
       for(let i=0; i<vCount; i++) {
          for(let j=0; j<vCount; j++) {
             let dik = dist[i][k] === 'INF' ? Infinity : dist[i][k];
             let dkj = dist[k][j] === 'INF' ? Infinity : dist[k][j];
             let dij = dist[i][j] === 'INF' ? Infinity : dist[i][j];
             if (dik !== Infinity && dkj !== Infinity && dik + dkj < dij) nextDist[i][j] = dik + dkj;
          }
       }
       dist = nextDist; matrices.push(dist.map(row => [...row]));
    }
    setNodeNames(bNodes); setRawEdges(bEdges); setDynamicMatrices(matrices); setDynamicK(0);
    buildGraph(bNodes, bEdges, null, 'basic', 0);
  }, [buildGraph]);

  useEffect(() => {
    if (activePage === 'basic') { generateDynamicGraph(dynamicV); return; }
    const fetchData = async () => {
      try {
        const response = await axios.post('http://localhost:5000/api/calculate', { domain: activePage });
        const { nodes: bNodes, edges: bEdges, distance_matrix, next_matrix } = response.data;

        // --- CUSTOM RENAME FOR SECURITY TAB ---
        let finalNodes = bNodes;
        if (activePage === 'security') {
          finalNodes = ["UB", "TP-1", "TP-2", "BIO TECH", "MAIN CAMPUS"];
        }

        setNodeNames(finalNodes); setRawEdges(bEdges); setMatrixData(distance_matrix); setNextMatrix(next_matrix);
        setSourceIndex(''); setDestIndex(''); setRouteDetails(null);
        setIsFloydsApplied(activePage !== 'transit');
        buildGraph(finalNodes, bEdges, null, activePage);
      } catch (error) { console.error("Error fetching data:", error); }
    };
    fetchData();
  }, [activePage, dynamicV, generateDynamicGraph, buildGraph]);

  useEffect(() => {
    if (activePage === 'basic' || !isFloydsApplied || sourceIndex === '' || destIndex === '' || !nextMatrix) return;
    let u = parseInt(sourceIndex), v = parseInt(destIndex);
    if (u === v || matrixData[u][v] === 'INF') {
      setRouteDetails(u === v ? { val: 0, path: [nodeNames[u]] } : { val: 'Unreachable', path: [] });
      buildGraph(nodeNames, rawEdges, u === v ? [] : null, activePage); return;
    }
    const pathNodes = [u], pathEdges = [];
    let curr = u;
    while (curr !== v) {
      let next = nextMatrix[curr][v];
      pathEdges.push({ u: curr, v: next }); pathNodes.push(next); curr = next;
    }
    setRouteDetails({ val: matrixData[u][v], path: pathNodes.map(idx => nodeNames[idx]) });
    buildGraph(nodeNames, rawEdges, pathEdges, activePage);
  }, [sourceIndex, destIndex, isFloydsApplied, matrixData, nextMatrix, nodeNames, rawEdges, buildGraph, activePage]);

  const formatNodeName = (name) => {
    if (!name) return '';
    const str = name.toString();
    return activePage === 'basic' ? str : (str.length > 5 ? str.substring(0, 4) + '.' : str.toUpperCase());
  };

  const panelStyle = { background: '#121212', border: '1px solid #222', borderRadius: '12px', padding: '1.5rem' };
  const selectStyle = { flex: 1, padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontFamily: 'monospace' };
  const navBtnStyle = (page) => ({ padding: '10px 20px', background: activePage === page ? '#00e5ff' : 'transparent', color: activePage === page ? '#000' : '#888', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' });

  const currentMatrix = activePage === 'basic' ? (dynamicMatrices[dynamicK] || []) : matrixData;

  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#e0e0e0', fontFamily: 'Inter, sans-serif', padding: '2rem 0' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #222', paddingBottom: '1rem' }}>
          <div><h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '1px' }}>FLOYD_WARSHALL // VISUALIZER</h1></div>
          <div style={{ display: 'flex', gap: '10px', background: '#0a0a0a', padding: '6px', borderRadius: '8px', border: '1px solid #222' }}>
            <button onClick={() => setActivePage('basic')} style={navBtnStyle('basic')}>1. ALGORITHM CORE</button>
            <button onClick={() => setActivePage('security')} style={navBtnStyle('security')}>2. NETWORK SECURITY</button>
            <button onClick={() => setActivePage('transit')} style={navBtnStyle('transit')}>3. TRANSIT SYSTEM</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', height: '650px' }}>
          <div style={{ ...panelStyle, flex: '1.5', position: 'relative', overflow: 'hidden', padding: 0 }}>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView fitViewOptions={{ padding: 0.3 }} nodesDraggable={false} proOptions={{ hideAttribution: true }}>
              <Background color="#1a1a1a" gap={20} size={1} />
            </ReactFlow>
          </div>

          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
            <div style={{ ...panelStyle }}>
              {activePage === 'basic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  <div style={{ background: '#0a0a0a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h4 style={{ color: '#00e5ff', margin: '0 0 10px 0', fontFamily: 'monospace', fontSize: '14px' }}>INTERACTIVE INDUCTION</h4>
                    <input type="range" min="3" max="6" value={dynamicV} style={{ width: '100%' }} onChange={e => setDynamicV(Number(e.target.value))} />
                    <input type="range" min="0" max={dynamicV} value={dynamicK} style={{ width: '100%' }} onChange={e => { const k = Number(e.target.value); setDynamicK(k); buildGraph(nodeNames, rawEdges, null, 'basic', k); }} />
                    <div style={{ fontSize: '11px', color: '#00e5ff', marginTop: '5px', fontFamily: 'monospace' }}>V: {dynamicV} | k: {dynamicK}</div>
                  </div>
                  <h3 style={{ color: '#00e5ff', margin: 0, fontSize: '14px' }}>STATEMENT</h3>
                  <p style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic', margin: 0 }}>"If the graph has no negative cycles, then after the k-th iteration, all shortest paths using {'{'}1...k{'}'} are correct."</p>
                </div>
              )}
              {activePage === 'security' && (
                <div>
                  <h3 style={{ color: '#00e5ff', margin: '0 0 10px 0', fontFamily: 'monospace' }}>SRM CAMPUS SECURITY</h3>
                  <p style={{ fontSize: '13px', color: '#aaa' }}>Mapping the path of least resistance across the campus network infrastructure.</p>
                </div>
              )}
              {activePage === 'transit' && (
                <div>
                  <h3 style={{ color: '#00e5ff', margin: '0 0 10px 0', fontFamily: 'monospace' }}>TRANSIT ROUTING</h3>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button onClick={() => setIsFloydsApplied(false)} style={{ ...selectStyle, flex: 1, background: !isFloydsApplied ? '#222' : '#0a0a0a' }}>RAW</button>
                    <button onClick={() => setIsFloydsApplied(true)} style={{ ...selectStyle, flex: 1, background: isFloydsApplied ? '#00e5ff' : '#0a0a0a', color: isFloydsApplied ? '#000' : '#fff' }}>FLOYD'S</button>
                  </div>
                </div>
              )}
            </div>

            {(activePage === 'security' || (activePage === 'transit' && isFloydsApplied)) && (
              <div style={{ ...panelStyle }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <select value={sourceIndex} onChange={e => setSourceIndex(e.target.value)} style={selectStyle}>
                    <option value="">ORIGIN</option>
                    {nodeNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                  <select value={destIndex} onChange={e => setDestIndex(e.target.value)} style={selectStyle}>
                    <option value="">TARGET</option>
                    {nodeNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                </div>
                {routeDetails && (
                  <div style={{ borderTop: '1px solid #222', paddingTop: '10px' }}>
                    <div style={{ fontSize: '24px', color: '#00e5ff', fontFamily: 'monospace' }}>{activePage === 'transit' ? `$${(2.00 + Math.floor(routeDetails.val / 5) * 0.50).toFixed(2)}` : routeDetails.val}</div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '5px' }}>[ {routeDetails.path.join(' -> ')} ]</div>
                  </div>
                )}
              </div>
            )}

            <div style={{ ...panelStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px', borderBottom: '1px solid #333' }}></th>
                      {currentMatrix && currentMatrix[0]?.map((_, j) => <th key={j} style={{ padding: '8px', borderBottom: '1px solid #333', color: '#666' }}>{formatNodeName(nodeNames[j])}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {currentMatrix?.map((row, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #1a1a1a', borderRight: '1px solid #333', color: '#666' }}>{formatNodeName(nodeNames[i])}</td>
                        {row.map((val, j) => (
                          <td key={j} style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #1a1a1a', color: val === 'INF' ? '#333' : '#aaa' }}>{val === 'INF' ? '∞' : val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;