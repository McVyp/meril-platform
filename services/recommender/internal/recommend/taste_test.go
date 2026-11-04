package recommend

import (
	"math"
	"testing"
)

func TestWatchWeight(t *testing.T) {
	tests := []struct {
		name                               string
		maxWatched, totalWatched, duration int
		want                               float32
	}{
		{"under 3s is a skip", 2, 10, 100, -1},
		{"3s is not a skip", 3, 10, 100, 0.5},
		{"unknown duration", 10, 10, 0, 0.5},
		{"just under 30%", 29, 29, 100, 0.5},
		{"30% starts the middle band", 30, 30, 100, 1.5},
		{"just under 80%", 79, 79, 100, 1.5},
		{"80% counts as a full watch", 80, 80, 100, 3},
		{"rewatches stay capped at 3", 120, 120, 100, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := watchWeight(tt.maxWatched, tt.totalWatched, tt.duration)
			if got != tt.want {
				t.Errorf("watchWeight(%d, %d, %d) = %v, want %v", tt.maxWatched, tt.totalWatched, tt.duration, got, tt.want)
			}
		})
	}
}

func TestNormalize(t *testing.T) {
	v := []float32{3, 4}
	if !normalize(v) {
		t.Fatal("normalize returned false for a non-zero vector")
	}

	if math.Abs(float64(v[0])-0.6) > 1e-6 || math.Abs(float64(v[1])-0.8) > 1e-6 {
		t.Fatalf("normalize([3, 4]) = %v, want [0.6 0.8]", v)
	}

	if normalize([]float32{0, 0, 0}) {
		t.Fatal("normalize returned true for a zero vector")
	}
}
