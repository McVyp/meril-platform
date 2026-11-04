package recommend

import (
	"math"
	"testing"
)

func TestRatioWeight(t *testing.T) {
	tests := []struct {
		ratio float64
		want  float32
	}{
		{0.09, -1}, // under 10% is a skip
		{0.1, 0.5}, // 10% is not a skip
		{0.29, 0.5},
		{0.3, 1.5},
		{0.79, 1.5},
		{0.8, 3},
		{2.0, 3}, // rewatches stay capped at 3
	}

	for _, tt := range tests {
		if got := ratioWeight(tt.ratio); got != tt.want {
			t.Errorf("ratioWeight(%v) = %v, want %v", tt.ratio, got, tt.want)
		}
	}
}

func TestBlend(t *testing.T) {
	long := []float32{1, 0}
	session := []float32{0, 1}

	// only one side present: return it unchanged
	if got := Blend(long, nil, 0.5); got[0] != 1 || got[1] != 0 {
		t.Errorf("Blend(long, nil) = %v, want long", got)
	}
	if got := Blend(nil, session, 0.5); got[0] != 0 || got[1] != 1 {
		t.Errorf("Blend(nil, session) = %v, want session", got)
	}

	// 50/50 of two directions: hal;fway between, length 1
	got := Blend(long, session, 0.5)
	half := float32(math.Sqrt(0.5))
	if math.Abs(float64(got[0])-float64(half)) > 1e-6 || math.Abs(float64(got[1])-float64(half)) > 1e-6 {
		t.Errorf("Blend 50/50 = %v, want [%v %v]", got, half, half)
	}

	// opposite tastes cancel out to zero: fall back to long-term taste
	if got := Blend(long, []float32{-1, 0}, 0.5); got[0] != 1 || got[1] != 0 {
		t.Errorf("Blend of opposites = %v, want long", got)
	}
}
