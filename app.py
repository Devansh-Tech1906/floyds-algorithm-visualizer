from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allows your React app to talk to this API

# Pre-defined graph data for both domains
# ... top of your app.py ...
DATA_STORE = {
    "basic": {
        "nodes": ["Node 1", "Node 2", "Node 3"],
        "edges": [
            {"u": 0, "v": 1, "w": 3},  # 1 -> 2
            {"u": 0, "v": 2, "w": 8},  # 1 -> 3
            {"u": 1, "v": 2, "w": 4}   # 2 -> 3
        ]
    },
    "security": {
        "nodes": ["Server A", "Server B", "Server C", "Server D", "Server E"],
        "edges": [
            {"u": 0, "v": 1, "w": 3},
            {"u": 0, "v": 2, "w": 8},
            {"u": 1, "v": 2, "w": 4},
            {"u": 1, "v": 3, "w": 6},
            {"u": 2, "v": 3, "w": 1},
            {"u": 3, "v": 4, "w": 5}
        ]
    },
    "transit": {
        "nodes": ["Union", "Central", "South", "North", "East"],
        "edges": [
            {"u": 0, "v": 1, "w": 4},
            {"u": 1, "v": 2, "w": 7},
            {"u": 2, "v": 4, "w": 5},
            {"u": 3, "v": 0, "w": 6},
            {"u": 3, "v": 4, "w": 10}
        ]
    }
}
# ... rest of your Python code remains the same ...


def run_floyd_warshall(V, edges):
    """Computes the shortest paths and the next-node matrix for path reconstruction."""
    INF = float('inf')
    dist = [[INF] * V for _ in range(V)]
    next_node = [[None] * V for _ in range(V)]

    # Initialize distances and next nodes
    for i in range(V):
        dist[i][i] = 0

    for edge in edges:
        u, v, w = edge['u'], edge['v'], edge['w']
        dist[u][v] = w
        next_node[u][v] = v

    # Standard Floyd-Warshall logic
    for k in range(V):
        for i in range(V):
            for j in range(V):
                if dist[i][k] != INF and dist[k][j] != INF and dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
                    next_node[i][j] = next_node[i][k]

    # Format infinity to a string for JSON serialization
    safe_dist = [["INF" if val == INF else val for val in row] for row in dist]
    return safe_dist, next_node


@app.route('/api/calculate', methods=['POST'])
def calculate_path():
    req_data = request.json
    domain = req_data.get('domain', 'security')

    graph = DATA_STORE.get(domain)
    if not graph:
        return jsonify({"error": "Invalid domain"}), 400

    V = len(graph['nodes'])
    dist_matrix, next_matrix = run_floyd_warshall(V, graph['edges'])

    return jsonify({
        "nodes": graph['nodes'],
        "edges": graph['edges'],  # <--- ADD THIS LINE
        "distance_matrix": dist_matrix,
        "next_matrix": next_matrix
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)