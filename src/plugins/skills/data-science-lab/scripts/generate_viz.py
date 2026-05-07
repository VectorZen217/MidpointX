import pandas as pd
import matplotlib.pyplot as plt

def generate_chart(csv_path, x_col, y_col, output_path):
    df = pd.read_csv(csv_path)
    plt.figure(figsize=(10, 6))
    plt.plot(df[x_col], df[y_col], marker='o')
    plt.title(f"{y_col} vs {x_col}")
    plt.xlabel(x_col)
    plt.ylabel(y_col)
    plt.grid(True)
    plt.savefig(output_path)
    plt.close() # Clean up
    print(f"Chart saved to {output_path}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 5:
        print("Usage: python generate_viz.py <csv_path> <x_col> <y_col> <output_path>")
        sys.exit(1)
    
    generate_chart(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
