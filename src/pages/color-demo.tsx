import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export default function ColorDemo() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Amber & Charcoal Color Scheme</h1>
          <p className="text-muted-foreground text-lg">
            Accessibility-focused design with amber accents and charcoal base
          </p>
        </div>

        {/* Brand Colors */}
        <Card>
          <CardHeader>
            <CardTitle>Brand Colors</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="h-20 w-full bg-amber-dark rounded-lg border border-border"></div>
              <p className="font-medium">Amber Dark</p>
              <p className="text-sm text-muted-foreground">#7A4B1F</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 w-full bg-amber rounded-lg border border-border"></div>
              <p className="font-medium">Amber</p>
              <p className="text-sm text-muted-foreground">#D88C2C</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 w-full bg-amber-light rounded-lg border border-border"></div>
              <p className="font-medium">Amber Light</p>
              <p className="text-sm text-muted-foreground">#F3C57A</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 w-full bg-charcoal rounded-lg border border-border"></div>
              <p className="font-medium text-white">Charcoal</p>
              <p className="text-sm text-gray-300">#2B1D0E</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 w-full bg-sand rounded-lg border border-border"></div>
              <p className="font-medium">Sand</p>
              <p className="text-sm text-muted-foreground">#FDF5E6</p>
            </div>
          </CardContent>
        </Card>

        {/* Semantic Colors */}
        <Card>
          <CardHeader>
            <CardTitle>Semantic Colors</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-16 w-full bg-primary text-primary-foreground rounded-lg border border-border flex items-center justify-center">
                <span className="font-medium">Primary</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-16 w-full bg-secondary text-secondary-foreground rounded-lg border border-border flex items-center justify-center">
                <span className="font-medium">Secondary</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-16 w-full bg-accent text-accent-foreground rounded-lg border border-border flex items-center justify-center">
                <span className="font-medium">Accent</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-16 w-full bg-muted text-muted-foreground rounded-lg border border-border flex items-center justify-center">
                <span className="font-medium">Muted</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interactive Elements */}
        <Card>
          <CardHeader>
            <CardTitle>Interactive Elements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button variant="default">Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="outline">Outline Button</Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="demo-input">Input Field</Label>
              <Input
                id="demo-input"
                placeholder="Type something..."
                className="focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-2">
              <Badge variant="default">Primary Badge</Badge>
              <Badge variant="secondary">Secondary Badge</Badge>
              <Badge variant="outline">Outline Badge</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Accessibility Demo */}
        <Card>
          <CardHeader>
            <CardTitle>Accessibility Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-sand text-charcoal rounded-lg border border-border">
                <h3 className="font-semibold mb-2">High Contrast Text</h3>
                <p>Charcoal text on sand background for optimal readability.</p>
              </div>
              <div className="p-4 bg-amber-light text-charcoal rounded-lg border border-border">
                <h3 className="font-semibold mb-2">Accent Background</h3>
                <p>Charcoal text on amber-light background maintains contrast.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                Focus Ring Demo
              </Button>
              <p className="text-sm text-muted-foreground">
                Tab to this button to see the focus ring in amber
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dark Mode Toggle */}
        <Card>
          <CardHeader>
            <CardTitle>Theme Toggle</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                document.documentElement.classList.toggle('dark');
              }}
              variant="outline"
            >
              Toggle Dark/Light Mode
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Click to test the dark mode color scheme
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
